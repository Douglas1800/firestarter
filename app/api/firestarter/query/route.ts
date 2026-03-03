import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { groq } from '@ai-sdk/groq'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { searchIndex, detectSourceType, generateSnippet } from '@/lib/upstash-search'
import { serverConfig as config } from '@/firestarter.config'

// Get AI model at runtime on server - Priority: Anthropic > OpenAI > Groq
const getModel = () => {
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      return anthropic('claude-sonnet-4-5-20250929')
    }
    if (process.env.OPENAI_API_KEY) {
      return openai('gpt-4o')
    }
    if (process.env.GROQ_API_KEY) {
      return groq('meta-llama/llama-4-scout-17b-16e-instruct')
    }
    throw new Error('No AI provider configured. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY')
  } catch (error) {
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Handle both direct query format and useChat format
    let query = body.query
    const namespace = body.namespace
    const stream = body.stream ?? false
    const mode: 'chat' | 'search' = body.mode || 'chat'
    const filters = body.filters || {}
    
    // If using useChat format, extract query from messages
    if (!query && body.messages && Array.isArray(body.messages)) {
      const lastUserMessage = body.messages.filter((m: { role: string }) => m.role === 'user').pop()
      query = lastUserMessage?.content
    }
    
    if (!query || !namespace) {
      return new Response(
        JSON.stringify({ error: 'Query and namespace are required' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    
    // Retrieve documents from Upstash Search
    interface SearchDocument {
      content?: {
        text?: string  // Searchable text
      }
      metadata?: {
        namespace?: string
        title?: string
        pageTitle?: string
        url?: string
        sourceURL?: string
        description?: string
        fullContent?: string  // Full content stored here
      }
      score?: number
    }
    
    let documents: SearchDocument[] = []

    try {
      // Search with server-side namespace filter for efficiency
      const namespaceFilter = `namespace = '${namespace}'`

      const searchResults = await searchIndex.search({
        query: query,
        limit: config.search.maxResults,
        filter: namespaceFilter,
        reranking: true
      })

      documents = searchResults

    } catch {
      console.error('Search failed')
      documents = []
    }
    
    // Check if we have any data for this namespace
    if (documents.length === 0) {
      
      const answer = `I don't have any indexed content for this website. Please make sure the website has been crawled first.`
      const sources: never[] = []
      
      if (stream) {
        // Create a simple text stream for the answer
        const result = await streamText({
          model: getModel(),
          prompt: answer,
          maxTokens: 1,
          temperature: 0,
        })
        
        return result.toDataStreamResponse()
      } else {
        return new Response(
          JSON.stringify({ answer, sources }), 
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Check if we have any AI provider configured
    try {
      const model = getModel()
      if (!model) {
        throw new Error('No AI model available')
      }
    } catch {
      const answer = 'AI service is not configured. Please set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in your environment variables.'
      return new Response(
        JSON.stringify({ answer, sources: [] }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Transform Upstash search results to expected format
    interface TransformedDocument {
      content: string
      url: string
      title: string
      description: string
      score: number
    }
    
    const transformedDocuments: TransformedDocument[] = documents.map((result) => {
      const title = result.metadata?.title || result.metadata?.pageTitle || 'Untitled'
      const description = result.metadata?.description || ''
      const url = result.metadata?.url || result.metadata?.sourceURL || ''
      
      // Get content from the document - prefer full content from metadata, fallback to searchable text
      const rawContent = result.metadata?.fullContent || result.content?.text || ''
      
      if (!rawContent) {
      }
      
      // Create structured content with clear metadata headers
      const structuredContent = `TITLE: ${title}
DESCRIPTION: ${description}
SOURCE: ${url}

${rawContent}`
      
      return {
        content: structuredContent,
        url: url,
        title: title,
        description: description,
        score: result.score || 0
      }
    })
    
    // Documents from Upstash are already scored by relevance
    // Sort by score and take top results
    const relevantDocs = transformedDocuments
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, config.search.maxSourcesDisplay) // Get many more sources for better coverage
    
    
    // If no matches, use more documents as context
    const docsToUse = relevantDocs.length > 0 ? relevantDocs : transformedDocuments.slice(0, 10)

    // ── Search mode: return enriched results without AI ──
    if (mode === 'search') {
      const { high, medium } = config.search.scoreThresholds
      const limit = Math.min(filters.limit || config.search.defaultSearchResults, config.search.maxSearchResults)

      let searchResults = docsToUse.map((doc, _i) => {
        // Find original document to get raw metadata
        const original = documents[transformedDocuments.indexOf(doc)]
        const sourceType = detectSourceType({
          id: (original as { id?: string })?.id || '',
          metadata: original?.metadata as Record<string, unknown> | undefined,
        })
        const rawContent = original?.metadata?.fullContent || original?.content?.text || doc.content || ''
        const snippet = generateSnippet(rawContent, query, config.search.snippetLength)
        const score = doc.score
        const scoreLabel = score >= high ? 'Tres pertinent' : score >= medium ? 'Pertinent' : 'Faible'

        return {
          id: (original as { id?: string })?.id || `doc-${_i}`,
          title: doc.title,
          url: doc.url,
          snippet,
          score,
          scoreLabel,
          sourceType,
          metadata: {
            crawlDate: (original?.metadata as Record<string, unknown>)?.crawlDate as string | undefined,
            description: doc.description,
            startsAt: (original?.metadata as Record<string, unknown>)?.startsAt as string | undefined,
            location: (original?.metadata as Record<string, unknown>)?.location as string | undefined,
          },
        }
      })

      // Apply sourceType filter
      if (filters.sourceType) {
        searchResults = searchResults.filter(r => r.sourceType === filters.sourceType)
      }

      // Apply limit
      searchResults = searchResults.slice(0, limit)

      return new Response(
        JSON.stringify({ results: searchResults, totalFound: searchResults.length, query }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build context from relevant documents - use more content for better answers
    const contextDocs = docsToUse.slice(0, config.search.maxContextDocs) // Use top docs for richer context
    
    // Log document structure for debugging
    if (contextDocs.length > 0) {
    }
    
    const context = contextDocs
      .map((doc) => {
        const content = doc.content || ''
        if (!content) {
          return null
        }
        return content.substring(0, config.search.maxContextLength) + '...'
      })
      .filter(Boolean)
      .join('\n\n---\n\n')
    
    
    // If context is empty, log error
    if (!context || context.length < 100) {
      
      const answer = 'I found some relevant pages but couldn\'t extract enough content to answer your question. This might be due to the way the pages were crawled. Try crawling the website again with a higher page limit.'
      const sources = docsToUse.map((doc) => ({
        url: doc.url,
        title: doc.title,
        snippet: (doc.content || '').substring(0, config.search.snippetLength) + '...'
      }))
      
      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare sources
    const sources = docsToUse.map((doc) => ({
      url: doc.url,
      title: doc.title,
      snippet: (doc.content || '').substring(0, config.search.snippetLength) + '...'
    }))
    

    // Generate response using Vercel AI SDK
    try {
      
      const systemPrompt = config.ai.systemPrompt

      const userPrompt = `Question: ${query}\n\nRelevant content from the website:\n${context}\n\nPlease provide a comprehensive answer based on this information.`

      
      // Log a sample of the actual content being sent


      if (stream) {
        
        let result
        try {
          const model = getModel()
          
          // Stream the response
          result = await streamText({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: config.ai.temperature,
            maxTokens: config.ai.maxTokens
          })
          
        } catch (streamError) {
          throw streamError
        }
        
        // Create a streaming response with sources
        
        // Always use custom streaming to include sources
        // The built-in toDataStreamResponse doesn't include our sources
        const encoder = new TextEncoder()
        
        const stream = new ReadableStream({
          async start(controller) {
            // Send sources as initial data
            const sourcesData = { sources }
            const sourcesLine = `8:${JSON.stringify(sourcesData)}\n`
            controller.enqueue(encoder.encode(sourcesLine))
            
            // Stream the text
            try {
              for await (const textPart of result.textStream) {
                // Format as Vercel AI SDK expects
                const escaped = JSON.stringify(textPart)
                controller.enqueue(encoder.encode(`0:${escaped}\n`))
              }
            } catch {
              console.error('Stream processing failed')
            }
            
            controller.close()
          }
        })
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        })
      } else {
        // Non-streaming response
        const result = await streamText({
          model: getModel(),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.ai.temperature,
          maxTokens: config.ai.maxTokens
        })
        
        // Get the full text
        let answer = ''
        for await (const textPart of result.textStream) {
          answer += textPart
        }
        
        return new Response(
          JSON.stringify({ answer, sources }), 
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
      
    } catch (groqError) {
      
      const errorMessage = groqError instanceof Error ? groqError.message : 'Unknown error'
      let answer = `Error generating response: ${errorMessage}`
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        answer = 'Error: Groq API authentication failed. Please check your GROQ_API_KEY.'
      } else if (errorMessage.includes('rate limit')) {
        answer = 'Error: Groq API rate limit exceeded. Please try again later.'
      }
      
      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch {
    console.error('Query processing failed')
    return new Response(
      JSON.stringify({ error: 'Failed to process query' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}