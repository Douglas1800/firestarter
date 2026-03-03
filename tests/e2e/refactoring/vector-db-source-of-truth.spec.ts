import { test, expect } from '@playwright/test'
import {
  backupCache,
  restoreCache,
  deleteCache,
  readCache,
} from '../helpers'

test.describe('Vector DB as Source of Truth', () => {
  let cacheBackup: string | null

  test.beforeEach(() => {
    cacheBackup = backupCache()
  })

  test.afterEach(() => {
    restoreCache(cacheBackup)
  })

  test('delete cache → /indexes → discovery recreates indexes', async ({ page }) => {
    deleteCache()

    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })

    // Wait for indexes to load via auto-discovery
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText('pages').first()).toBeVisible({ timeout: 20_000 })

    // Cache file should have been recreated
    const cache = readCache()
    expect(cache).not.toBeNull()
    expect(cache!.lastSyncedAt).not.toBe('1970-01-01T00:00:00Z')
    expect(cache!.indexes.length).toBeGreaterThan(0)
  })

  test('full navigation works without cache', async ({ page }) => {
    deleteCache()

    // Start at /indexes
    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 20_000 })

    // Click first card → /dashboard
    const firstCard = page.locator('[class*="cursor-pointer"]').first()
    await expect(firstCard).toBeVisible({ timeout: 20_000 })
    await firstCard.click()

    await expect(page).toHaveURL(/\/dashboard\?namespace=/, { timeout: 10_000 })

    // Dashboard should load correctly
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Pages', { exact: true }).first()).toBeVisible()
  })

  test('forceSync reconstructs the cache', async ({ request }) => {
    const response = await request.get('/api/indexes?forceSync=true')
    expect(response.status()).toBe(200)

    const cache = readCache()
    expect(cache).not.toBeNull()

    // lastSyncedAt should be very recent (within last 30 seconds)
    const syncAge = Date.now() - new Date(cache!.lastSyncedAt).getTime()
    expect(syncAge).toBeLessThan(30_000)
  })

  test('cache after sync has the correct structure', async ({ request }) => {
    deleteCache()

    await request.get('/api/indexes')

    const cache = readCache()
    expect(cache).not.toBeNull()
    expect(cache).toHaveProperty('lastSyncedAt')
    expect(cache).toHaveProperty('indexes')
    expect(Array.isArray(cache!.indexes)).toBe(true)

    for (const index of cache!.indexes) {
      expect(index).toHaveProperty('namespace')
      expect(typeof index.namespace).toBe('string')
      expect(index).toHaveProperty('pagesCrawled')
      expect(index.pagesCrawled).toBeGreaterThan(0)
      expect(Array.isArray(index.sources)).toBe(true)
    }
  })
})
