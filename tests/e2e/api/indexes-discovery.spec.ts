import { test, expect } from '@playwright/test'
import {
  backupCache,
  restoreCache,
  deleteCache,
  expireCache,
  readCache,
  KNOWN_NAMESPACES,
} from '../helpers'

test.describe('Indexes Discovery & Cache', () => {
  let cacheBackup: string | null

  test.beforeEach(() => {
    cacheBackup = backupCache()
  })

  test.afterEach(() => {
    restoreCache(cacheBackup)
  })

  test('cache deleted → auto-discovery recreates indexes', async ({ request }) => {
    deleteCache()

    const response = await request.get('/api/indexes')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.indexes.length).toBeGreaterThan(0)

    // Cache file should be recreated
    const cache = readCache()
    expect(cache).not.toBeNull()
    expect(cache!.indexes.length).toBeGreaterThan(0)
  })

  test('discovered indexes have the correct structure', async ({ request }) => {
    deleteCache()

    const response = await request.get('/api/indexes')
    const body = await response.json()

    for (const index of body.indexes) {
      expect(index).toHaveProperty('namespace')
      expect(typeof index.namespace).toBe('string')
      expect(index).toHaveProperty('pagesCrawled')
      expect(index.pagesCrawled).toBeGreaterThan(0)
      expect(Array.isArray(index.sources)).toBe(true)
    }
  })

  test('fresh cache does not re-sync (lastSyncedAt stays the same)', async ({ request }) => {
    // First call to ensure cache is fresh
    await request.get('/api/indexes')
    const cacheAfterFirst = readCache()
    const firstTimestamp = cacheAfterFirst?.lastSyncedAt

    // Second call immediately
    await request.get('/api/indexes')
    const cacheAfterSecond = readCache()

    expect(cacheAfterSecond?.lastSyncedAt).toBe(firstTimestamp)
  })

  test('expired cache triggers re-sync', async ({ request }) => {
    // Ensure cache exists
    await request.get('/api/indexes')
    const cacheBefore = readCache()
    expect(cacheBefore).not.toBeNull()

    // Expire it
    expireCache()
    const expired = readCache()
    expect(expired?.lastSyncedAt).toBe('1970-01-01T00:00:00Z')

    // Next call should re-sync
    await request.get('/api/indexes')
    const cacheAfter = readCache()
    expect(cacheAfter?.lastSyncedAt).not.toBe('1970-01-01T00:00:00Z')
    expect(new Date(cacheAfter!.lastSyncedAt).getTime()).toBeGreaterThan(Date.now() - 30_000)
  })

  test('?forceSync=true forces refresh even with fresh cache', async ({ request }) => {
    // Ensure fresh cache
    await request.get('/api/indexes')
    const cacheBefore = readCache()

    // Wait a tiny bit so timestamp differs
    await new Promise(r => setTimeout(r, 100))

    // Force sync
    await request.get('/api/indexes?forceSync=true')
    const cacheAfter = readCache()

    // lastSyncedAt should have been updated
    expect(cacheAfter?.lastSyncedAt).not.toBe(cacheBefore?.lastSyncedAt)
  })

  test('merge preserves rich metadata from cache', async ({ request }) => {
    // Ensure we have a cache with real data
    await request.get('/api/indexes')
    const cacheBefore = readCache()
    const knownIndex = cacheBefore?.indexes.find(
      i => i.namespace === KNOWN_NAMESPACES.culturel
    )

    // Skip if no rich metadata to test
    if (!knownIndex?.metadata?.title) {
      test.skip()
      return
    }

    const titleBefore = knownIndex.metadata.title

    // Expire and re-sync
    expireCache()
    await request.get('/api/indexes')

    const cacheAfter = readCache()
    const indexAfter = cacheAfter?.indexes.find(
      i => i.namespace === KNOWN_NAMESPACES.culturel
    )

    // Title (rich metadata) should be preserved from cache
    expect(indexAfter?.metadata?.title).toBe(titleBefore)
  })
})
