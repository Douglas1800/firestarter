import { Redis } from '@upstash/redis'
import * as fs from 'fs'
import * as path from 'path'

export interface SourceEntry {
  url: string                    // "https://echandole.ch" or "geocity://yverdon"
  type: 'firecrawl' | 'geocity' | 'pdf'
  lastCrawledAt: string          // ISO date of last crawl
  documentCount: number
}

export interface CrawlHistoryEntry {
  crawledAt: string
  sourceUrl: string
  documentsFound: number
  newDocuments: number
  updatedDocuments: number
}

export interface IndexMetadata {
  url: string
  namespace: string
  pagesCrawled: number
  createdAt: string
  metadata?: {
    title?: string
    description?: string
    favicon?: string
    ogImage?: string
  }
  sources?: SourceEntry[]
  lastCrawledAt?: string
  crawlHistory?: CrawlHistoryEntry[]  // max 20 entries
}

interface StorageAdapter {
  getIndexes(): Promise<IndexMetadata[]>
  getIndex(namespace: string): Promise<IndexMetadata | null>
  saveIndex(index: IndexMetadata): Promise<void>
  deleteIndex(namespace: string): Promise<void>
}

// Cache file format
interface CacheFile {
  lastSyncedAt: string
  indexes: IndexMetadata[]
}

class RedisStorageAdapter implements StorageAdapter {
  private redis: Redis
  private readonly INDEXES_KEY = 'firestarter:indexes'
  private readonly INDEX_KEY_PREFIX = 'firestarter:index:'

  constructor() {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis configuration missing')
    }

    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }

  async getIndexes(): Promise<IndexMetadata[]> {
    try {
      const indexes = await this.redis.get<IndexMetadata[]>(this.INDEXES_KEY)
      return indexes || []
    } catch {
      console.error('Failed to get indexes from Redis')
      return []
    }
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    try {
      const index = await this.redis.get<IndexMetadata>(`${this.INDEX_KEY_PREFIX}${namespace}`)
      return index
    } catch {
      console.error('Failed to get index from Redis')
      return null
    }
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    try {
      // Save individual index
      await this.redis.set(`${this.INDEX_KEY_PREFIX}${index.namespace}`, index)

      // Update indexes list
      const indexes = await this.getIndexes()
      const existingIndex = indexes.findIndex(i => i.namespace === index.namespace)

      if (existingIndex !== -1) {
        indexes[existingIndex] = index
      } else {
        indexes.unshift(index)
      }

      // Keep only the last 50 indexes
      const limitedIndexes = indexes.slice(0, 50)
      await this.redis.set(this.INDEXES_KEY, limitedIndexes)
    } catch (error) {
      throw error
    }
  }

  async deleteIndex(namespace: string): Promise<void> {
    try {
      // Delete individual index
      await this.redis.del(`${this.INDEX_KEY_PREFIX}${namespace}`)

      // Update indexes list
      const indexes = await this.getIndexes()
      const filteredIndexes = indexes.filter(i => i.namespace !== namespace)
      await this.redis.set(this.INDEXES_KEY, filteredIndexes)
    } catch (error) {
      throw error
    }
  }
}

// File-based storage adapter for server-side without Redis
class FileStorageAdapter implements StorageAdapter {
  private readonly filePath: string

  constructor() {
    this.filePath = path.join(process.cwd(), '.data', 'indexes.json')
    // Ensure directory exists
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private readFile(): IndexMetadata[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(data)
        // Backward compat: raw array = just indexes, no cache wrapper
        if (Array.isArray(parsed)) return parsed
        // New format: { lastSyncedAt, indexes }
        if (parsed && Array.isArray(parsed.indexes)) return parsed.indexes
      }
    } catch {
      console.error('Failed to read storage file')
    }
    return []
  }

  private writeFile(indexes: IndexMetadata[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(indexes, null, 2), 'utf-8')
  }

  async getIndexes(): Promise<IndexMetadata[]> {
    return this.readFile()
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    const indexes = this.readFile()
    return indexes.find(i => i.namespace === namespace) || null
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    const indexes = this.readFile()
    const existingIndex = indexes.findIndex(i => i.namespace === index.namespace)

    if (existingIndex !== -1) {
      indexes[existingIndex] = index
    } else {
      indexes.unshift(index)
    }

    this.writeFile(indexes.slice(0, 50))
  }

  async deleteIndex(namespace: string): Promise<void> {
    const indexes = this.readFile()
    this.writeFile(indexes.filter(i => i.namespace !== namespace))
  }
}

/**
 * VectorCacheStorageAdapter — uses .data/indexes.json as a TTL cache
 * backed by the Upstash Vector DB as source of truth.
 *
 * - getIndexes() returns from cache if fresh, otherwise syncs from vector DB
 * - saveIndex() writes to cache (crawl routes provide rich metadata)
 * - deleteIndex() deletes vectors from Upstash + removes from cache
 */
class VectorCacheStorageAdapter implements StorageAdapter {
  private readonly filePath: string
  private readonly ttlMs: number

  constructor(ttlSeconds: number) {
    this.filePath = path.join(process.cwd(), '.data', 'indexes.json')
    this.ttlMs = ttlSeconds * 1000
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private readCache(): CacheFile | null {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(data)
        // Backward compat: raw array = treat as expired cache
        if (Array.isArray(parsed)) {
          return { lastSyncedAt: '1970-01-01T00:00:00Z', indexes: parsed }
        }
        if (parsed && parsed.lastSyncedAt && Array.isArray(parsed.indexes)) {
          return parsed as CacheFile
        }
      }
    } catch {
      console.error('Failed to read cache file')
    }
    return null
  }

  private writeCache(indexes: IndexMetadata[]): void {
    const cache: CacheFile = {
      lastSyncedAt: new Date().toISOString(),
      indexes,
    }
    fs.writeFileSync(this.filePath, JSON.stringify(cache, null, 2), 'utf-8')
  }

  private isCacheFresh(): boolean {
    const cache = this.readCache()
    if (!cache) return false
    const age = Date.now() - new Date(cache.lastSyncedAt).getTime()
    return age < this.ttlMs
  }

  async getIndexes(): Promise<IndexMetadata[]> {
    if (this.isCacheFresh()) {
      const cache = this.readCache()
      return cache?.indexes || []
    }
    return this.syncFromVectorDB()
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    const indexes = await this.getIndexes()
    return indexes.find(i => i.namespace === namespace) || null
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    const cache = this.readCache()
    const indexes = cache?.indexes || []
    const existingIndex = indexes.findIndex(i => i.namespace === index.namespace)

    if (existingIndex !== -1) {
      indexes[existingIndex] = index
    } else {
      indexes.unshift(index)
    }

    this.writeCache(indexes.slice(0, 50))
  }

  async deleteIndex(namespace: string): Promise<void> {
    // Delete vectors from Upstash
    try {
      const { deleteByNamespace } = await import('./upstash-search')
      const deleted = await deleteByNamespace(namespace)
      console.log(`Deleted ${deleted} vectors for namespace "${namespace}"`)
    } catch (err) {
      console.error(`Failed to delete vectors for namespace "${namespace}":`, err)
    }

    // Remove from cache
    const cache = this.readCache()
    const indexes = (cache?.indexes || []).filter(i => i.namespace !== namespace)
    this.writeCache(indexes)
  }

  /**
   * Sync cache from vector DB by discovering namespaces and merging with existing cache data.
   */
  private async syncFromVectorDB(): Promise<IndexMetadata[]> {
    try {
      const { discoverNamespaces } = await import('./upstash-search')
      const discovered = await discoverNamespaces()

      const cache = this.readCache()
      const cachedIndexes = cache?.indexes || []
      const cachedMap = new Map(cachedIndexes.map(i => [i.namespace, i]))

      const mergedIndexes: IndexMetadata[] = []

      for (const ns of discovered) {
        const cached = cachedMap.get(ns.namespace)

        if (cached) {
          // Namespace in both: keep rich metadata from cache, override counts from vector DB
          mergedIndexes.push({
            ...cached,
            pagesCrawled: ns.documentCount,
            lastCrawledAt: ns.latestCrawlDate || cached.lastCrawledAt,
          })
        } else {
          // Namespace only in vector DB: create new entry from discovered data
          mergedIndexes.push({
            url: ns.firstUrl || '',
            namespace: ns.namespace,
            pagesCrawled: ns.documentCount,
            createdAt: ns.latestCrawlDate || new Date().toISOString(),
            metadata: {
              title: ns.representativeTitle || ns.namespace,
            },
            sources: ns.sourceTypes.map(type => ({
              url: type === 'geocity' ? 'geocity://yverdon' : ns.firstUrl || '',
              type: type === 'web' ? 'firecrawl' as const : type,
              lastCrawledAt: ns.latestCrawlDate || '',
              documentCount: 0,
            })),
            lastCrawledAt: ns.latestCrawlDate,
          })
        }

        cachedMap.delete(ns.namespace)
      }

      // Namespaces only in cache but not in vector DB: skip (vectors were deleted)
      // cachedMap entries remaining are orphaned cache entries — don't include them

      this.writeCache(mergedIndexes)
      return mergedIndexes
    } catch (err) {
      console.error('Failed to sync from vector DB:', err)
      // Fallback: return whatever is in cache
      const cache = this.readCache()
      return cache?.indexes || []
    }
  }

  /**
   * Force a re-sync on next getIndexes() call by resetting the cache timestamp.
   */
  invalidate(): void {
    const cache = this.readCache()
    if (cache) {
      cache.lastSyncedAt = '1970-01-01T00:00:00Z'
      fs.writeFileSync(this.filePath, JSON.stringify(cache, null, 2), 'utf-8')
    }
  }
}

// Factory function to get the appropriate storage adapter
function getStorageAdapter(): StorageAdapter {
  // Use Redis if both environment variables are set
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new RedisStorageAdapter()
  }

  // Use VectorCacheStorageAdapter if Upstash Search is configured (vector DB = source of truth)
  if (typeof window === 'undefined' && process.env.UPSTASH_SEARCH_REST_URL && process.env.UPSTASH_SEARCH_REST_TOKEN) {
    const ttl = 300 // 5 minutes default, matches config.storage.cacheTtlSeconds
    return new VectorCacheStorageAdapter(ttl)
  }

  // Fallback to file-based storage on server
  if (typeof window === 'undefined') {
    return new FileStorageAdapter()
  }

  // No storage available on client without Redis
  throw new Error('No storage adapter available on client side')
}

// Lazy initialization to avoid errors at module load time
let storage: StorageAdapter | null = null

function getStorage(): StorageAdapter | null {
  if (!storage) {
    try {
      storage = getStorageAdapter()
    } catch {
      // This is expected on the server without Redis configured
      return null
    }
  }
  return storage
}

export const getIndexes = async (): Promise<IndexMetadata[]> => {
  const adapter = getStorage()
  if (!adapter) {
    return []
  }

  try {
    return await adapter.getIndexes()
  } catch {
    console.error('Failed to get indexes')
    return []
  }
}

export const getIndex = async (namespace: string): Promise<IndexMetadata | null> => {
  const adapter = getStorage()
  if (!adapter) {
    return null
  }

  try {
    return await adapter.getIndex(namespace)
  } catch {
    console.error('Failed to get index')
    return null
  }
}

export const saveIndex = async (index: IndexMetadata): Promise<void> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available - index not saved')
    return
  }

  try {
    return await adapter.saveIndex(index)
  } catch {
    // Don't throw - this allows the app to continue functioning
    console.error('Failed to save index')
  }
}

export const deleteIndex = async (namespace: string): Promise<void> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available - index not deleted')
    return
  }

  try {
    return await adapter.deleteIndex(namespace)
  } catch {
    // Don't throw - this allows the app to continue functioning
    console.error('Failed to delete index')
  }
}

/**
 * Invalidate the cache to force re-sync from vector DB on next read.
 * No-op if the adapter is not VectorCacheStorageAdapter.
 */
export const invalidateCache = (): void => {
  const adapter = getStorage()
  if (adapter && adapter instanceof VectorCacheStorageAdapter) {
    adapter.invalidate()
  }
}
