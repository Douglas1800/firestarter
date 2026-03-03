import * as fs from 'fs'
import * as path from 'path'

/** Known namespaces with real data in Upstash */
export const KNOWN_NAMESPACES = {
  culturel: 'agenda-culturel-nv',
  politique: 'agenda-politique-nv',
}

/** Path to the file-based cache */
export const CACHE_FILE = path.join(process.cwd(), '.data', 'indexes.json')

/** Cache file structure */
export interface CacheFile {
  lastSyncedAt: string
  indexes: Array<{
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
    sources?: Array<{
      url: string
      type: 'firecrawl' | 'geocity' | 'pdf'
      lastCrawledAt: string
      documentCount: number
    }>
    lastCrawledAt?: string
    crawlHistory?: Array<{
      crawledAt: string
      sourceUrl: string
      documentsFound: number
      newDocuments: number
      updatedDocuments: number
    }>
  }>
}

/** Read and parse the cache file. Returns null if missing or invalid. */
export function readCache(): CacheFile | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        return { lastSyncedAt: '1970-01-01T00:00:00Z', indexes: parsed }
      }
      if (parsed && parsed.lastSyncedAt && Array.isArray(parsed.indexes)) {
        return parsed as CacheFile
      }
    }
  } catch {
    // ignore
  }
  return null
}

/** Backup the raw content of the cache file. Returns null if file doesn't exist. */
export function backupCache(): string | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return fs.readFileSync(CACHE_FILE, 'utf-8')
    }
  } catch {
    // ignore
  }
  return null
}

/** Restore cache from a previously saved backup string. */
export function restoreCache(backup: string | null): void {
  const dir = path.dirname(CACHE_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (backup === null) {
    // Original state was "no file" → delete it
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE)
    }
  } else {
    fs.writeFileSync(CACHE_FILE, backup, 'utf-8')
  }
}

/** Delete the cache file entirely. */
export function deleteCache(): void {
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE)
  }
}

/** Set lastSyncedAt to epoch so the cache is treated as expired. */
export function expireCache(): void {
  const cache = readCache()
  if (cache) {
    cache.lastSyncedAt = '1970-01-01T00:00:00Z'
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
  }
}
