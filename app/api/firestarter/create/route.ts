import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from '@mendable/firecrawl-js'
import { searchIndex, hashId, getExistingIds, deleteByPrefix } from '@/lib/upstash-search'
import { saveIndex, getIndex, invalidateCache } from '@/lib/storage'
import type { SourceEntry, CrawlHistoryEntry } from '@/lib/storage'
import { serverConfig as config } from '@/firestarter.config'


export async function POST(request: NextRequest) {
  try {
    // Check if creation is disabled
    if (!config.features.enableCreation) {
      return NextResponse.json({
        error: 'Chatbot creation is currently disabled. You can only view existing chatbots.'
      }, { status: 403 })
    }

    let body;
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      url,
      limit = config.crawling.defaultLimit,
      includePaths,
      excludePaths,
      existingNamespace,
      themeLabel,
      isRefresh = false,
      forceRecrawl = false,
    } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Use existing namespace if provided (multi-source mode), otherwise generate new one
    let namespace: string
    const isMultiSource = !!existingNamespace

    if (existingNamespace) {
      namespace = existingNamespace
    } else {
      const baseNamespace = new URL(url).hostname.replace(/\./g, '-')
      const timestamp = Date.now()
      namespace = `${baseNamespace}-${timestamp}`
    }

    // Build a prefix for this source's documents
    const sourcePrefix = `${namespace}-web-`

    // If force recrawl, delete existing documents for this source
    if (forceRecrawl) {
      await deleteByPrefix(sourcePrefix)
    }

    // Get existing IDs before upsert (for counting new vs updated)
    let existingIds = new Set<string>()
    if (isRefresh) {
      existingIds = await getExistingIds(sourcePrefix)
    }

    // Initialize Firecrawl with API key from environment or headers
    const apiKey = process.env.FIRECRAWL_API_KEY || request.headers.get('X-Firecrawl-API-Key')
    if (!apiKey) {
      return NextResponse.json({
        error: 'Firecrawl API key is not configured. Please provide your API key.'
      }, { status: 500 })
    }

    const firecrawl = new FirecrawlApp({
      apiKey: apiKey
    })

    // Start crawling the website with specified limit

    const crawlOptions = {
      limit: limit,
      scrapeOptions: {
        formats: ['markdown'] as ('markdown')[],
        onlyMainContent: true,
        waitFor: 5000,
        excludeTags: ['nav', 'footer', 'header', 'aside', '.cookie', '.cookies', '#cookie', '.menu', '.sidebar', '.advertisement', '.ads'],
        blockAds: true,
        removeBase64Images: true,
        timeout: config.crawling.scrapeTimeout,
        maxAge: config.crawling.cacheMaxAge,
      },
      includePaths: undefined as string[] | undefined,
      excludePaths: undefined as string[] | undefined
    }

    // Add include/exclude paths if provided
    if (includePaths && Array.isArray(includePaths) && includePaths.length > 0) {
      crawlOptions.includePaths = includePaths
    }
    if (excludePaths && Array.isArray(excludePaths) && excludePaths.length > 0) {
      crawlOptions.excludePaths = excludePaths
    }

    const crawlResponse = await firecrawl.crawlUrl(url, crawlOptions) as {
      success: boolean
      data: Array<{
        url?: string
        markdown?: string
        content?: string
        metadata?: {
          title?: string
          description?: string
          ogDescription?: string
          sourceURL?: string
          favicon?: string
          ogImage?: string
          'og:image'?: string
        }
      }>
    }


    // Store the crawl data for immediate use
    const crawlId = 'immediate-' + Date.now()

    // Log first page content preview for debugging
    if (crawlResponse.data && crawlResponse.data.length > 0) {
      const homepage = crawlResponse.data.find((page) => {
        const pageUrl = page.metadata?.sourceURL || page.url || ''
        return pageUrl === url || pageUrl === url + '/' || pageUrl === url.replace(/\/$/, '')
      }) || crawlResponse.data[0]

      console.log('Homepage:', {
        title: homepage?.metadata?.title,
        url: homepage?.metadata?.sourceURL || homepage?.url
      })
    }

    // Store documents in Upstash Search with stable URL-hash IDs
    const documents = crawlResponse.data.map((page) => {
      const fullContent = page.markdown || page.content || ''
      const title = page.metadata?.title || 'Untitled'
      const pageUrl = page.metadata?.sourceURL || page.url || ''
      const description = page.metadata?.description || page.metadata?.ogDescription || ''

      const searchableText = `${title} ${description} ${fullContent}`.substring(0, 4000)

      // Stable ID based on URL hash instead of position index
      const stableId = `${namespace}-web-${hashId(pageUrl)}`

      return {
        id: stableId,
        content: {
          text: searchableText,
          url: pageUrl,
          title: title
        },
        metadata: {
          namespace: namespace,
          title: title,
          url: pageUrl,
          sourceURL: page.metadata?.sourceURL || page.url || '',
          crawlDate: new Date().toISOString(),
          pageTitle: page.metadata?.title,
          description: page.metadata?.description || page.metadata?.ogDescription,
          favicon: page.metadata?.favicon,
          ogImage: page.metadata?.ogImage || page.metadata?.['og:image'],
          fullContent: fullContent.substring(0, 10000)
        }
      }
    })

    // Count new vs updated documents
    let newDocuments = 0
    let updatedDocuments = 0

    if (isRefresh) {
      for (const doc of documents) {
        if (existingIds.has(doc.id)) {
          updatedDocuments++
        } else {
          newDocuments++
        }
      }
    }

    // Store documents in batches
    const batchSize = 10

    try {
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)
        await searchIndex.upsert(batch)
      }
    } catch (upsertError) {
      throw new Error(`Failed to store documents: ${upsertError instanceof Error ? upsertError.message : 'Unknown error'}`)
    }

    // Save index metadata to storage
    const homepage = crawlResponse.data.find((page) => {
      const pageUrl = page.metadata?.sourceURL || page.url || ''
      return pageUrl === url || pageUrl === url + '/' || pageUrl === url.replace(/\/$/, '')
    }) || crawlResponse.data[0]

    const now = new Date().toISOString()

    try {
      const existingIndex = await getIndex(namespace)

      // Build source entry for this URL
      const sourceEntry: SourceEntry = {
        url,
        type: 'firecrawl',
        lastCrawledAt: now,
        documentCount: documents.length,
      }

      // Build crawl history entry
      const crawlHistoryEntry: CrawlHistoryEntry = {
        crawledAt: now,
        sourceUrl: url,
        documentsFound: documents.length,
        newDocuments: isRefresh ? newDocuments : documents.length,
        updatedDocuments: isRefresh ? updatedDocuments : 0,
      }

      if (isMultiSource || isRefresh) {
        // Multi-source or refresh mode: update existing index
        const previousPages = existingIndex?.pagesCrawled || 0
        const existingSources = existingIndex?.sources || []

        // Update or add source entry
        const sourceIdx = existingSources.findIndex(s => s.url === url)
        if (sourceIdx !== -1) {
          existingSources[sourceIdx] = sourceEntry
        } else {
          existingSources.push(sourceEntry)
        }

        // Build crawl history (keep last 20)
        const crawlHistory = existingIndex?.crawlHistory || []
        crawlHistory.unshift(crawlHistoryEntry)
        const limitedHistory = crawlHistory.slice(0, 20)

        // Recalculate total pages from all sources
        const totalPages = existingSources.reduce((sum, s) => sum + s.documentCount, 0)

        await saveIndex({
          url: existingSources.map(s => s.url).join(' | '),
          namespace,
          pagesCrawled: isRefresh ? totalPages : previousPages + (crawlResponse.data?.length || 0),
          createdAt: existingIndex?.createdAt || now,
          metadata: existingIndex?.metadata || {
            title: themeLabel || homepage?.metadata?.title,
            description: `Agenda multi-sources (${existingSources.length} sources)`,
            favicon: homepage?.metadata?.favicon,
            ogImage: homepage?.metadata?.ogImage || homepage?.metadata?.['og:image']
          },
          sources: existingSources,
          lastCrawledAt: now,
          crawlHistory: limitedHistory,
        })
      } else {
        await saveIndex({
          url,
          namespace,
          pagesCrawled: crawlResponse.data?.length || 0,
          createdAt: now,
          metadata: {
            title: themeLabel || homepage?.metadata?.title,
            description: homepage?.metadata?.description || homepage?.metadata?.ogDescription,
            favicon: homepage?.metadata?.favicon,
            ogImage: homepage?.metadata?.ogImage || homepage?.metadata?.['og:image']
          },
          sources: [sourceEntry],
          lastCrawledAt: now,
          crawlHistory: [crawlHistoryEntry],
        })
      }
    } catch {
      console.error('Failed to save index metadata')
    }

    invalidateCache()

    return NextResponse.json({
      success: true,
      namespace,
      crawlId,
      isMultiSource,
      isRefresh,
      message: isRefresh
        ? `Refresh terminé: ${newDocuments} nouveaux, ${updatedDocuments} mis à jour`
        : isMultiSource
        ? `Source ajoutée au namespace ${namespace} (${crawlResponse.data?.length || 0} pages)`
        : `Crawl completed successfully (limited to ${limit} pages)`,
      details: {
        url,
        pagesLimit: limit,
        pagesCrawled: crawlResponse.data?.length || 0,
        formats: ['markdown', 'html'],
        newDocuments: isRefresh ? newDocuments : undefined,
        updatedDocuments: isRefresh ? updatedDocuments : undefined,
      },
      data: crawlResponse.data
    })
  } catch (error) {

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined


    if (statusCode === 401) {
      return NextResponse.json(
        { error: 'Firecrawl authentication failed. Please check your API key.' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to start crawl',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}
