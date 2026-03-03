import { test, expect } from '@playwright/test'
import { KNOWN_NAMESPACES } from '../helpers'

test.describe('Dashboard Page (/dashboard)', () => {
  test('loads with a valid namespace', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)

    // Wait for the dashboard to fully load — the title appears in a h1
    // The dashboard first shows "Loading..." then renders content
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    // Stats panel should show pages count
    await expect(page.getByText('Pages', { exact: true }).first()).toBeVisible()

    // Chat input should be present
    const input = page.locator('input[type="text"]')
    await expect(input).toBeVisible()
  })

  test('redirects to /indexes if namespace is invalid', async ({ page }) => {
    await page.goto('/dashboard?namespace=nonexistent-namespace-12345')
    // The page fetches /api/indexes, doesn't find the namespace, then router.push('/indexes')
    await expect(page).toHaveURL(/\/indexes/, { timeout: 20_000 })
  })

  test('redirects to /indexes if no namespace param', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/indexes/, { timeout: 20_000 })
  })

  test('shows suggestion buttons when chat is empty', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    // Should see 3 suggestion buttons
    await expect(page.getByText('Quels événements ce week-end ?')).toBeVisible()
    await expect(page.getByText('Fais-moi un agenda de la semaine')).toBeVisible()
    await expect(page.getByText('Quelles sont les prochaines séances publiques ?')).toBeVisible()
  })

  test('toggling Chat/Recherche changes placeholder', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    const input = page.locator('input[type="text"]')

    // Default is chat mode
    await expect(input).toHaveAttribute('placeholder', /Posez une question/)

    // Toggle to search mode
    await page.getByRole('button', { name: /Recherche/i }).click()
    await expect(input).toHaveAttribute('placeholder', /Rechercher dans/)
  })

  test('search returns results', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    // Switch to search mode
    await page.getByRole('button', { name: /Recherche/i }).click()

    // Type and submit a search
    const input = page.locator('input[type="text"]')
    await input.fill('concert')
    await page.locator('button[type="submit"]').click()

    // Wait for results — component uses "resultat" (no accent)
    await expect(page.getByText('resultat', { exact: false })).toBeVisible({ timeout: 20_000 })
  })

  test('chat sends a message and receives a response', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    const input = page.locator('input[type="text"]')
    await input.fill('Bonjour')
    await page.locator('button[type="submit"]').click()

    // User message should appear (in orange bubble)
    await expect(page.locator('.bg-orange-500').filter({ hasText: 'Bonjour' })).toBeVisible({ timeout: 5_000 })

    // Wait for assistant response (in white bubble with border)
    // The response appears as streamed text
    await expect(page.locator('.border.border-gray-200.text-gray-800').first()).toBeVisible({ timeout: 30_000 })
  })

  test('delete intercepts the DELETE request correctly', async ({ page }) => {
    await page.goto(`/dashboard?namespace=${KNOWN_NAMESPACES.culturel}`)
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible({ timeout: 20_000 })

    // Intercept DELETE request — don't actually delete
    let interceptedNamespace: string | null = null
    await page.route('**/api/indexes*', (route, request) => {
      if (request.method() === 'DELETE') {
        const url = new URL(request.url())
        interceptedNamespace = url.searchParams.get('namespace')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      }
      return route.continue()
    })

    // Click the Delete button in the header
    await page.getByRole('button', { name: 'Delete' }).click()

    // Confirm in the modal
    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Delete' }).click()

    // Verify the correct namespace was sent
    await page.waitForTimeout(2000)
    expect(interceptedNamespace).toBe(KNOWN_NAMESPACES.culturel)
  })
})
