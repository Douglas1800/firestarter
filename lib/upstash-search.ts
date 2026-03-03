import { Index } from '@upstash/vector'
import { createHash } from 'crypto'

// Initialize Upstash Vector client directly
const vectorIndex = new Index({
  url: process.env.UPSTASH_SEARCH_REST_URL!,
  token: process.env.UPSTASH_SEARCH_REST_TOKEN!,
})

const NAMESPACE = 'firestarter'

/**
 * Generate a stable hash-based ID from a URL.
 * Used to create deterministic document IDs so re-crawls overwrite instead of duplicating.
 */
export function hashId(input: string): string {
  return createHash('sha256').update(input).digest('hex').substring(0, 12)
}

/**
 * Get existing document IDs that match a prefix.
 * Uses vector index range scan to find all IDs starting with the given prefix.
 */
export async function getExistingIds(prefix: string): Promise<Set<string>> {
  const ids = new Set<string>()
  let cursor = '0'

  do {
    const result = await vectorIndex.range({
      cursor,
      limit: 100,
      includeMetadata: false,
      includeData: false,
    }, { namespace: NAMESPACE })

    for (const item of result.vectors) {
      if (typeof item.id === 'string' && item.id.startsWith(prefix)) {
        ids.add(item.id)
      }
    }

    cursor = result.nextCursor
  } while (cursor !== '0' && cursor !== '')

  return ids
}

/**
 * Delete all documents whose IDs start with the given prefix.
 * Used for force-recrawl or source removal.
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  const ids = await getExistingIds(prefix)
  if (ids.size === 0) return 0

  const idArray = Array.from(ids)
  // Delete in batches of 100
  for (let i = 0; i < idArray.length; i += 100) {
    const batch = idArray.slice(i, i + 100)
    await vectorIndex.delete(batch, { namespace: NAMESPACE })
  }

  return ids.size
}

export interface FirestarterContent {
  text: string
  url: string
  title: string
  [key: string]: unknown
}

export interface FirestarterIndex {
  namespace: string
  url: string
  pagesCrawled: number
  crawlDate: string
  metadata: {
    title: string
    description?: string
    favicon?: string
    ogImage?: string
  }
}

// Compatible wrapper around @upstash/vector that matches the @upstash/search interface
// used by the create and query routes
/**
 * Detect source type from document metadata or ID patterns.
 */
export function detectSourceType(doc: { id: string | number; metadata?: Record<string, unknown> }): 'web' | 'pdf' | 'geocity' {
  const id = String(doc.id)
  const source = (doc.metadata?.source as string) || ''
  const url = (doc.metadata?._content_url as string) || (doc.metadata?.url as string) || ''

  if (source === 'geocity' || id.startsWith('geocity-') || url.startsWith('geocity://')) return 'geocity'
  if (source === 'pdf' || id.startsWith('pdf-') || url.startsWith('pdf://') || url.endsWith('.pdf')) return 'pdf'
  return 'web'
}

/**
 * Extract the most relevant snippet from content based on query terms.
 * Falls back to the first `maxLength` characters if no query match is found.
 */
export function generateSnippet(content: string, query: string, maxLength = 300): string {
  if (!content) return ''

  const cleaned = content.replace(/\s+/g, ' ').trim()
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)

  if (terms.length === 0) return cleaned.substring(0, maxLength)

  // Find the position with the best term density
  let bestPos = -1
  let bestScore = 0

  for (const term of terms) {
    const idx = cleaned.toLowerCase().indexOf(term)
    if (idx === -1) continue

    // Score: count how many terms appear near this position
    const window = cleaned.toLowerCase().substring(Math.max(0, idx - 100), idx + maxLength + 100)
    const score = terms.filter(t => window.includes(t)).length
    if (score > bestScore) {
      bestScore = score
      bestPos = idx
    }
  }

  if (bestPos === -1) return cleaned.substring(0, maxLength)

  // Center the snippet around the best position
  const start = Math.max(0, bestPos - 50)
  const end = Math.min(cleaned.length, start + maxLength)
  let snippet = cleaned.substring(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < cleaned.length) snippet = snippet + '...'

  return snippet
}

/**
 * Discovered namespace info from scanning vector DB.
 */
export interface DiscoveredNamespace {
  namespace: string
  documentCount: number
  sourceTypes: ('web' | 'pdf' | 'geocity')[]
  latestCrawlDate?: string
  representativeTitle?: string
  firstUrl?: string
}

/**
 * Scan the entire vector DB and discover unique namespaces with stats.
 * Extracts namespace from document metadata or ID prefix patterns.
 */
export async function discoverNamespaces(): Promise<DiscoveredNamespace[]> {
  const namespaceMap = new Map<string, {
    documentCount: number
    sourceTypes: Set<string>
    latestCrawlDate?: string
    representativeTitle?: string
    firstUrl?: string
  }>()

  let cursor = '0'

  do {
    const result = await vectorIndex.range({
      cursor,
      limit: 100,
      includeMetadata: true,
      includeData: false,
    }, { namespace: NAMESPACE })

    for (const item of result.vectors) {
      const id = String(item.id)
      const metadata = (item.metadata || {}) as Record<string, unknown>

      // Extract namespace from metadata or ID prefix
      const ns = (metadata.namespace as string) || extractNamespaceFromId(id)
      if (!ns) continue

      const existing = namespaceMap.get(ns) || {
        documentCount: 0,
        sourceTypes: new Set<string>(),
        latestCrawlDate: undefined,
        representativeTitle: undefined,
        firstUrl: undefined,
      }

      existing.documentCount++
      existing.sourceTypes.add(detectSourceType({ id, metadata }).toString())

      // Track the latest crawl date
      const crawlDate = (metadata.crawledAt as string) || (metadata.indexedAt as string)
      if (crawlDate && (!existing.latestCrawlDate || crawlDate > existing.latestCrawlDate)) {
        existing.latestCrawlDate = crawlDate
      }

      // Capture representative title and first URL
      if (!existing.representativeTitle) {
        existing.representativeTitle = (metadata._content_title as string) || (metadata.title as string)
      }
      if (!existing.firstUrl) {
        existing.firstUrl = (metadata._content_url as string) || (metadata.url as string)
      }

      namespaceMap.set(ns, existing)
    }

    cursor = result.nextCursor
  } while (cursor !== '0' && cursor !== '')

  return Array.from(namespaceMap.entries()).map(([ns, data]) => ({
    namespace: ns,
    documentCount: data.documentCount,
    sourceTypes: Array.from(data.sourceTypes) as ('web' | 'pdf' | 'geocity')[],
    latestCrawlDate: data.latestCrawlDate,
    representativeTitle: data.representativeTitle,
    firstUrl: data.firstUrl,
  }))
}

/**
 * Extract namespace from document ID patterns like "namespace-web-hash" or "namespace-pdf-hash".
 */
function extractNamespaceFromId(id: string): string | null {
  // Match patterns: "some-namespace-web-xxxx", "some-namespace-pdf-xxxx", "geocity-some-namespace-xxxx"
  const match = id.match(/^(.+?)-(web|pdf|geocity)-[a-f0-9]+$/)
  if (match) return match[1]

  // Fallback: try splitting by last dash-separated hash
  const parts = id.split('-')
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1]
    // If last part looks like a hash (hex), the rest is namespace-type prefix
    if (/^[a-f0-9]{8,}$/.test(lastPart)) {
      return parts.slice(0, -1).join('-')
    }
  }

  return null
}

/**
 * Get stats for a specific namespace by counting documents with matching prefix.
 */
export async function getNamespaceStats(namespace: string): Promise<{ documentCount: number; sourceBreakdown: Record<string, number> }> {
  const breakdown: Record<string, number> = {}
  let total = 0
  let cursor = '0'

  do {
    const result = await vectorIndex.range({
      cursor,
      limit: 100,
      includeMetadata: true,
      includeData: false,
    }, { namespace: NAMESPACE })

    for (const item of result.vectors) {
      const id = String(item.id)
      const metadata = (item.metadata || {}) as Record<string, unknown>
      const ns = (metadata.namespace as string) || extractNamespaceFromId(id)

      if (ns === namespace) {
        total++
        const type = detectSourceType({ id, metadata })
        breakdown[type] = (breakdown[type] || 0) + 1
      }
    }

    cursor = result.nextCursor
  } while (cursor !== '0' && cursor !== '')

  return { documentCount: total, sourceBreakdown: breakdown }
}

/**
 * Delete all vectors belonging to a namespace.
 */
export async function deleteByNamespace(namespace: string): Promise<number> {
  // Collect all IDs that belong to this namespace
  const idsToDelete: string[] = []
  let cursor = '0'

  do {
    const result = await vectorIndex.range({
      cursor,
      limit: 100,
      includeMetadata: true,
      includeData: false,
    }, { namespace: NAMESPACE })

    for (const item of result.vectors) {
      const id = String(item.id)
      const metadata = (item.metadata || {}) as Record<string, unknown>
      const ns = (metadata.namespace as string) || extractNamespaceFromId(id)

      if (ns === namespace) {
        idsToDelete.push(id)
      }
    }

    cursor = result.nextCursor
  } while (cursor !== '0' && cursor !== '')

  if (idsToDelete.length === 0) return 0

  // Delete in batches of 100
  for (let i = 0; i < idsToDelete.length; i += 100) {
    const batch = idsToDelete.slice(i, i + 100)
    await vectorIndex.delete(batch, { namespace: NAMESPACE })
  }

  return idsToDelete.length
}

export const searchIndex = {
  upsert: async (
    params:
      | { id: string; content: FirestarterContent; metadata?: Record<string, unknown> }
      | { id: string; content: FirestarterContent; metadata?: Record<string, unknown> }[]
  ) => {
    const items = Array.isArray(params) ? params : [params]

    const vectorDocs = items.map((item) => ({
      id: item.id,
      data: item.content.text || `${item.content.title} ${item.content.url}`,
      metadata: {
        ...item.metadata,
        // Store content fields in metadata for retrieval
        _content_text: item.content.text,
        _content_url: item.content.url,
        _content_title: item.content.title,
      },
    }))

    await vectorIndex.upsert(vectorDocs, { namespace: NAMESPACE })
    return 'Success'
  },

  search: async (params: {
    query: string
    limit?: number
    filter?: string
    reranking?: boolean
  }) => {
    const results = await vectorIndex.query(
      {
        data: params.query,
        topK: params.limit || 10,
        includeMetadata: true,
        includeData: true,
        filter: params.filter,
      },
      { namespace: NAMESPACE }
    )

    return results.map((result) => {
      const metadata = (result.metadata || {}) as Record<string, unknown>

      return {
        id: result.id,
        content: {
          text: (metadata._content_text as string) || (result.data as string) || '',
          url: (metadata._content_url as string) || '',
          title: (metadata._content_title as string) || '',
        },
        metadata: Object.fromEntries(
          Object.entries(metadata).filter(([key]) => !key.startsWith('_content_'))
        ),
        score: result.score || 0,
      }
    })
  },
}
