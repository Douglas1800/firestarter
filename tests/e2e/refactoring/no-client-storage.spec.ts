import { test, expect } from '@playwright/test'
import { KNOWN_NAMESPACES } from '../helpers'

test.describe('No Client Storage for Indexes', () => {
  test('/indexes works after clearing all storage', async ({ page }) => {
    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })

    // Wait for indexes to load
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })

    // Clear all client storage
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    await page.reload()
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })

    // Indexes should still be there — loaded from API, not storage
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText('pages').first()).toBeVisible({ timeout: 15_000 })
  })

  test('/dashboard works after clearing all storage', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    // Clear all client storage
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    await page.reload()

    // Dashboard should still load — data comes from the API
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Pages', { exact: true }).first()).toBeVisible()
  })

  test('no sessionStorage keys related to indexes', async ({ page }) => {
    // Navigate through the app
    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })

    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    await page.goto(`/manage?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByText('Sources (', { exact: false })).toBeVisible({ timeout: 20_000 })

    // Check sessionStorage
    const sessionKeys = await page.evaluate(() => Object.keys(sessionStorage))
    const indexRelatedKeys = sessionKeys.filter(
      k => k.includes('index') || k.includes('firestarter') || k.includes('namespace')
    )
    expect(indexRelatedKeys).toEqual([])
  })

  test('localStorage only contains firecrawl_api_key (if any)', async ({ page }) => {
    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })

    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    // Check localStorage
    const localKeys = await page.evaluate(() => Object.keys(localStorage))
    const indexRelatedKeys = localKeys.filter(
      k => k.includes('firestarter_indexes') || k.includes('indexes') || k.includes('namespace')
    )
    expect(indexRelatedKeys).toEqual([])
  })
})
