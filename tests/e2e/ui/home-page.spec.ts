import { test, expect } from '@playwright/test'

test.describe('Home Page (/)', () => {
  test('displays both agenda themes', async ({ page }) => {
    await page.goto('/')
    // Wait for the loading state to resolve (check-env API call)
    await expect(page.getByText('Agenda Culturel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Agenda Politique')).toBeVisible()
  })

  test('selecting a theme shows source configuration', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Agenda Culturel')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Agenda Culturel').click()

    await expect(page.getByText('Sources à crawler')).toBeVisible()
    await expect(page.getByText('Charger les suggestions')).toBeVisible()
  })

  test('loading suggestions populates source list', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Agenda Culturel')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Agenda Culturel').click()
    await page.getByText('Charger les suggestions').click()

    // Should show geocity and web sources
    await expect(page.getByText('geocity.ch API', { exact: false })).toBeVisible()
    await expect(page.getByText('echandole.ch', { exact: false })).toBeVisible()
  })

  test('adding a custom URL source', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Agenda Culturel')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Agenda Culturel').click()

    const input = page.getByPlaceholder('https://www.exemple.ch/evenements')
    await input.fill('https://custom-test.example.com')
    // Click the + button (it's the button with Plus icon near the input)
    await page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).click()

    await expect(page.getByText('custom-test.example.com', { exact: false })).toBeVisible()
  })

  test('removing a source', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Agenda Culturel')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Agenda Culturel').click()
    await page.getByText('Charger les suggestions').click()

    // Count sources before
    const trashButtons = page.locator('button').filter({ has: page.locator('svg.lucide-trash2') })
    const countBefore = await trashButtons.count()
    expect(countBefore).toBeGreaterThan(0)

    // Remove first source
    await trashButtons.first().click()

    // Count should decrease
    const countAfter = await page.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).count()
    expect(countAfter).toBe(countBefore - 1)
  })

  test('"Mes agendas" link navigates to /indexes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Mes agendas')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Mes agendas').click()
    await expect(page).toHaveURL(/\/indexes/)
  })
})
