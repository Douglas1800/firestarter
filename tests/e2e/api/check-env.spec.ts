import { test, expect } from '@playwright/test'

test.describe('GET /api/check-env', () => {
  test('returns environment status with booleans', async ({ request }) => {
    const response = await request.get('/api/check-env')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('environmentStatus')

    const status = body.environmentStatus
    expect(typeof status.FIRECRAWL_API_KEY).toBe('boolean')
    expect(typeof status.OPENAI_API_KEY).toBe('boolean')
    expect(typeof status.ANTHROPIC_API_KEY).toBe('boolean')
    expect(typeof status.DISABLE_CHATBOT_CREATION).toBe('boolean')
  })
})
