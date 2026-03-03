import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from '@mendable/firecrawl-js'
import { searchIndex, hashId, getExistingIds } from '@/lib/upstash-search'
import { saveIndex, getIndex, invalidateCache } from '@/lib/storage'
import type { SourceEntry, CrawlHistoryEntry } from '@/lib/storage'

/**
 * Extract all PDF links from HTML content.
 * Resolves relative URLs to absolute using the base URL.
 */
function extractPdfLinks(html: string, baseUrl: string): string[] {
  const pdfLinks: string[] = []
  const seen = new Set<string>()

  // Match href attributes pointing to .pdf files
  const regex = /href=["']([^"']*\.pdf[^"']*)["']/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).href
      if (!seen.has(resolved)) {
        seen.add(resolved)
        pdfLinks.push(resolved)
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return pdfLinks
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      url,
      namespace: providedNamespace,
      existingNamespace,
      isRefresh = false,
      maxPdfs = 100,
    } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const targetNamespace = existingNamespace || providedNamespace || `pdf-${Date.now()}`
    const sourceUrl = `pdf://${url.replace(/^https?:\/\//, '')}`

    // Build prefix for PDF documents
    const sourcePrefix = `${targetNamespace}-pdf-`

    // Get existing IDs before upsert (for counting new vs updated)
    let existingIds = new Set<string>()
    if (isRefresh) {
      existingIds = await getExistingIds(sourcePrefix)
    }

    // Initialize Firecrawl
    const apiKey = process.env.FIRECRAWL_API_KEY || request.headers.get('X-Firecrawl-API-Key')
    if (!apiKey) {
      return NextResponse.json({
        error: 'Firecrawl API key is not configured. Please provide your API key.',
      }, { status: 500 })
    }

    const firecrawl = new FirecrawlApp({ apiKey })

    // Step 1: Scrape the target page to get HTML
    console.log(`[PDF] Scraping page: ${url}`)
    const pageResult = await firecrawl.scrapeUrl(url, { formats: ['html'] })

    if (!pageResult.success || !pageResult.html) {
      return NextResponse.json({
        error: 'Failed to scrape the target page',
        details: 'Could not retrieve HTML content from the URL',
      }, { status: 500 })
    }

    // Step 2: Extract PDF links from HTML
    const pdfLinks = extractPdfLinks(pageResult.html, url)
    console.log(`[PDF] Found ${pdfLinks.length} PDF links on ${url}`)

    if (pdfLinks.length === 0) {
      return NextResponse.json({
        success: true,
        namespace: targetNamespace,
        isRefresh,
        message: 'Aucun lien PDF trouvé sur cette page',
        details: {
          pageScraped: url,
          pdfsFound: 0,
          pdfsIndexed: 0,
        },
      })
    }

    // Limit the number of PDFs to process
    const limitedPdfLinks = pdfLinks.slice(0, maxPdfs)
    console.log(`[PDF] Processing ${limitedPdfLinks.length} PDFs (limit: ${maxPdfs})`)

    // Step 3: Scrape each PDF with Firecrawl (batch of 5)
    const scrapeBatchSize = 5
    const documents: {
      id: string
      content: { text: string; url: string; title: string }
      metadata: Record<string, unknown>
    }[] = []

    for (let i = 0; i < limitedPdfLinks.length; i += scrapeBatchSize) {
      const batch = limitedPdfLinks.slice(i, i + scrapeBatchSize)
      const batchPromises = batch.map(async (pdfUrl) => {
        try {
          const result = await firecrawl.scrapeUrl(pdfUrl, {
            formats: ['markdown'],
            timeout: 60000,
          })

          if (result.success && result.markdown) {
            const markdown = result.markdown
            const title = result.metadata?.title || pdfUrl.split('/').pop()?.replace('.pdf', '') || 'Document PDF'
            const searchableText = `${title} ${markdown}`.substring(0, 4000)

            return {
              id: `${targetNamespace}-pdf-${hashId(pdfUrl)}`,
              content: {
                text: searchableText,
                url: pdfUrl,
                title: title,
              },
              metadata: {
                namespace: targetNamespace,
                title: title,
                url: pdfUrl,
                sourceURL: pdfUrl,
                sourcePage: url,
                crawlDate: new Date().toISOString(),
                pageTitle: title,
                description: markdown.substring(0, 200),
                source: 'pdf',
                fullContent: markdown.substring(0, 10000),
              },
            }
          }
          console.warn(`[PDF] Failed to scrape PDF: ${pdfUrl}`)
          return null
        } catch (err) {
          console.warn(`[PDF] Error scraping PDF ${pdfUrl}:`, err)
          return null
        }
      })

      const results = await Promise.all(batchPromises)
      for (const doc of results) {
        if (doc) documents.push(doc)
      }
    }

    console.log(`[PDF] Successfully scraped ${documents.length}/${limitedPdfLinks.length} PDFs`)

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

    // Index documents in Upstash Vector (batch of 10)
    const indexBatchSize = 10
    for (let i = 0; i < documents.length; i += indexBatchSize) {
      const batch = documents.slice(i, i + indexBatchSize)
      await searchIndex.upsert(batch)
    }

    console.log(`[PDF] Indexed ${documents.length} PDF documents in namespace: ${targetNamespace}`)

    // Save index metadata
    const now = new Date().toISOString()

    try {
      const existingIndex = await getIndex(targetNamespace)

      const sourceEntry: SourceEntry = {
        url: sourceUrl,
        type: 'pdf',
        lastCrawledAt: now,
        documentCount: documents.length,
      }

      const crawlHistoryEntry: CrawlHistoryEntry = {
        crawledAt: now,
        sourceUrl: sourceUrl,
        documentsFound: documents.length,
        newDocuments: isRefresh ? newDocuments : documents.length,
        updatedDocuments: isRefresh ? updatedDocuments : 0,
      }

      if (existingIndex) {
        const existingSources = existingIndex.sources || []

        // Update or add source entry
        const sourceIdx = existingSources.findIndex(s => s.url === sourceUrl)
        if (sourceIdx !== -1) {
          existingSources[sourceIdx] = sourceEntry
        } else {
          existingSources.push(sourceEntry)
        }

        // Build crawl history (keep last 20)
        const crawlHistory = existingIndex.crawlHistory || []
        crawlHistory.unshift(crawlHistoryEntry)
        const limitedHistory = crawlHistory.slice(0, 20)

        // Recalculate total pages from all sources
        const totalPages = existingSources.reduce((sum, s) => sum + s.documentCount, 0)

        await saveIndex({
          ...existingIndex,
          url: existingSources.map(s => s.url).join(' | '),
          pagesCrawled: totalPages,
          sources: existingSources,
          lastCrawledAt: now,
          crawlHistory: limitedHistory,
        })
      } else {
        let hostname = 'unknown'
        try { hostname = new URL(url).hostname } catch {}

        await saveIndex({
          url: sourceUrl,
          namespace: targetNamespace,
          pagesCrawled: documents.length,
          createdAt: now,
          metadata: {
            title: `PDFs de ${hostname}`,
            description: `${documents.length} PDFs extraits de ${url}`,
          },
          sources: [sourceEntry],
          lastCrawledAt: now,
          crawlHistory: [crawlHistoryEntry],
        })
      }
    } catch {
      console.warn('[PDF] Failed to save index metadata (storage adapter may not be configured)')
    }

    invalidateCache()

    return NextResponse.json({
      success: true,
      namespace: targetNamespace,
      isRefresh,
      message: isRefresh
        ? `Refresh terminé: ${newDocuments} nouveaux, ${updatedDocuments} mis à jour`
        : `${documents.length} PDFs extraits et indexés depuis ${url}`,
      details: {
        pageScraped: url,
        pdfsFound: pdfLinks.length,
        pdfsProcessed: limitedPdfLinks.length,
        pdfsIndexed: documents.length,
        source: 'pdf-extraction',
        newDocuments: isRefresh ? newDocuments : undefined,
        updatedDocuments: isRefresh ? updatedDocuments : undefined,
      },
    })
  } catch (error) {
    console.error('[PDF] Import failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to extract and index PDFs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
