import { test, expect } from '@playwright/test'
import { KNOWN_NAMESPACES } from '../helpers'

test.describe('Query API', () => {
  test('search mode returns results with correct structure', async ({ request }) => {
    const response = await request.post('/api/firestarter/query', {
      data: {
        query: 'événements',
        namespace: KNOWN_NAMESPACES.culturel,
        mode: 'search',
      },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('results')
    expect(body).toHaveProperty('totalFound')
    expect(body).toHaveProperty('query')
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.length).toBeGreaterThan(0)
  })

  test('search results have valid scores', async ({ request }) => {
    const response = await request.post('/api/firestarter/query', {
      data: {
        query: 'concert',
        namespace: KNOWN_NAMESPACES.culturel,
        mode: 'search',
      },
    })
    const body = await response.json()

    for (const result of body.results) {
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
      expect(['Tres pertinent', 'Pertinent', 'Faible']).toContain(result.scoreLabel)
    }
  })

  test('search on politique namespace returns results', async ({ request }) => {
    const response = await request.post('/api/firestarter/query', {
      data: {
        query: 'conseil',
        namespace: KNOWN_NAMESPACES.politique,
        mode: 'search',
      },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.results.length).toBeGreaterThan(0)
  })

  test('chat non-streaming returns answer and sources', async ({ request }) => {
    const response = await request.post('/api/firestarter/query', {
      data: {
        query: 'Quels sont les prochains événements ?',
        namespace: KNOWN_NAMESPACES.culturel,
        stream: false,
      },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(typeof body.answer).toBe('string')
    expect(body.answer.length).toBeGreaterThan(0)
    expect(Array.isArray(body.sources)).toBe(true)
  })

  test('chat streaming returns correct format', async ({ request }) => {
    const response = await request.post('/api/firestarter/query', {
      data: {
        query: 'Quels concerts cette semaine ?',
        namespace: KNOWN_NAMESPACES.culturel,
        stream: true,
      },
    })
    expect(response.status()).toBe(200)

    const text = await response.text()
    const lines = text.split('\n').filter(l => l.trim() !== '')

    // Should have 0: (text) and 8: (sources) lines
    const hasText = lines.some(l => l.startsWith('0:'))
    const hasSources = lines.some(l => l.startsWith('8:'))

    expect(hasText).toBe(true)
    expect(hasSources).toBe(true)
  })

  test('400 if namespace is missing', async ({ request }) => {
    const response = await request.post('/api/firestarter/query', {
      data: {
        query: 'test',
      },
    })
    expect(response.status()).toBe(400)
  })
})
