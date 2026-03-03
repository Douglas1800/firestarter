import { test, expect } from '@playwright/test'

test.describe('Indexes Page (/indexes)', () => {
  test('displays indexes fetched from the API', async ({ page }) => {
    await page.goto('/indexes')

    // Wait for the heading to appear
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })

    // Wait for loading to finish — "Loading indexes..." should disappear
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })

    // At least one index card should be visible (cards contain "pages" text)
    await expect(page.getByText('pages').first()).toBeVisible({ timeout: 15_000 })
  })

  test('clicking a card navigates to /dashboard', async ({ page }) => {
    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })

    // Click the first card with "pages" indicator
    const firstCard = page.locator('[class*="cursor-pointer"]').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    await firstCard.click()

    await expect(page).toHaveURL(/\/dashboard\?namespace=/, { timeout: 10_000 })
  })

  test('works after clearing localStorage', async ({ page }) => {
    await page.goto('/indexes')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })

    // Clear all client storage
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    // Indexes should still load from the API
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Loading indexes...')).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText('pages').first()).toBeVisible({ timeout: 15_000 })
  })

  test('shows empty state when API returns no indexes', async ({ page }) => {
    // Intercept the API to return empty
    await page.route('**/api/indexes*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ indexes: [] }),
      })
    )

    await page.goto('/indexes')
    await expect(page.getByText('Aucun agenda')).toBeVisible({ timeout: 15_000 })
  })

  test('"Créer un agenda" button navigates to /', async ({ page }) => {
    await page.goto('/indexes')
    await expect(page.getByText('Créer un agenda')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Créer un agenda').click()
    await expect(page).toHaveURL('http://localhost:3000/')
  })
})
