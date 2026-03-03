import { test, expect } from '@playwright/test'
import { KNOWN_NAMESPACES } from '../helpers'

test.describe('Manage Page (/manage)', () => {
  test('loads sources from the API', async ({ page }) => {
    await page.goto(`/manage?namespace=${KNOWN_NAMESPACES.culturel}`)

    // Wait for content to load — the Sources heading appears after data is fetched
    await expect(page.getByText('Sources (', { exact: false })).toBeVisible({ timeout: 20_000 })

    // Should show source type badges
    const sourceBadges = page.locator('span').filter({ hasText: /API directe|PDF extraction|Firecrawl/ })
    await expect(sourceBadges.first()).toBeVisible()
  })

  test('displays stats (creation date, total documents)', async ({ page }) => {
    await page.goto(`/manage?namespace=${KNOWN_NAMESPACES.culturel}`)

    await expect(page.getByText('Créé le')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Total documents')).toBeVisible()
  })

  test('redirects to /indexes if namespace is missing', async ({ page }) => {
    await page.goto('/manage')
    await expect(page).toHaveURL(/\/indexes/, { timeout: 20_000 })
  })

  test('shows "Agenda introuvable" if namespace does not exist', async ({ page }) => {
    await page.goto('/manage?namespace=nonexistent-namespace-12345')

    await expect(page.getByText('Agenda introuvable')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Retour aux agendas')).toBeVisible()
  })

  test('Dashboard link navigates to /dashboard', async ({ page }) => {
    await page.goto(`/manage?namespace=${KNOWN_NAMESPACES.culturel}`)
    // Wait for the page to load
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard\?namespace=/)
  })
})
