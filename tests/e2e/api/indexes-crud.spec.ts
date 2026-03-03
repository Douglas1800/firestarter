import { test, expect } from '@playwright/test'
import { KNOWN_NAMESPACES, backupCache, restoreCache } from '../helpers'

const TEMP_NAMESPACE = 'playwright-test-temp'

test.describe('Indexes CRUD API', () => {
  let cacheBackup: string | null

  test.beforeEach(() => {
    cacheBackup = backupCache()
  })

  test.afterEach(() => {
    restoreCache(cacheBackup)
  })

  test('GET /api/indexes returns an array of indexes', async ({ request }) => {
    const response = await request.get('/api/indexes')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('indexes')
    expect(Array.isArray(body.indexes)).toBe(true)
    expect(body.indexes.length).toBeGreaterThan(0)
  })

  test('GET /api/indexes contains known namespaces', async ({ request }) => {
    const response = await request.get('/api/indexes')
    const body = await response.json()
    const namespaces = body.indexes.map((i: { namespace: string }) => i.namespace)

    expect(namespaces).toContain(KNOWN_NAMESPACES.culturel)
    expect(namespaces).toContain(KNOWN_NAMESPACES.politique)
  })

  test('POST saves a temporary index, GET finds it, then cleanup', async ({ request }) => {
    // Create temp index
    const postResponse = await request.post('/api/indexes', {
      data: {
        url: 'https://playwright-test.example.com',
        namespace: TEMP_NAMESPACE,
        pagesCrawled: 0,
        createdAt: new Date().toISOString(),
        metadata: { title: 'Playwright Temp Index' },
      },
    })
    expect(postResponse.status()).toBe(200)

    // Verify it exists
    const getResponse = await request.get('/api/indexes')
    const body = await getResponse.json()
    const found = body.indexes.find((i: { namespace: string }) => i.namespace === TEMP_NAMESPACE)
    expect(found).toBeTruthy()
    expect(found.metadata.title).toBe('Playwright Temp Index')

    // Cleanup — use route interceptor to mock the vector delete
    // Since the temp namespace has 0 vectors, this is safe
    const deleteResponse = await request.delete(`/api/indexes?namespace=${TEMP_NAMESPACE}`)
    expect(deleteResponse.status()).toBe(200)
  })

  test('PATCH addSource adds a source to an existing index', async ({ request }) => {
    const response = await request.patch('/api/indexes', {
      data: {
        namespace: KNOWN_NAMESPACES.culturel,
        action: 'addSource',
        source: {
          url: 'https://playwright-test-source.example.com',
          type: 'firecrawl',
        },
      },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.sources)).toBe(true)
    const added = body.sources.find(
      (s: { url: string }) => s.url === 'https://playwright-test-source.example.com'
    )
    expect(added).toBeTruthy()
  })

  test('PATCH rejects if namespace is missing', async ({ request }) => {
    const response = await request.patch('/api/indexes', {
      data: {
        action: 'addSource',
        source: { url: 'https://example.com', type: 'firecrawl' },
      },
    })
    expect(response.status()).toBe(400)
  })

  test('PATCH 404 if namespace does not exist', async ({ request }) => {
    const response = await request.patch('/api/indexes', {
      data: {
        namespace: 'nonexistent-namespace-12345',
        action: 'addSource',
        source: { url: 'https://example.com', type: 'firecrawl' },
      },
    })
    expect(response.status()).toBe(404)
  })

  test('DELETE rejects if namespace is missing', async ({ request }) => {
    const response = await request.delete('/api/indexes')
    expect(response.status()).toBe(400)
  })

  test('DELETE removes a temporary index', async ({ request }) => {
    // Create temp
    await request.post('/api/indexes', {
      data: {
        url: 'https://playwright-delete-test.example.com',
        namespace: TEMP_NAMESPACE,
        pagesCrawled: 0,
        createdAt: new Date().toISOString(),
        metadata: { title: 'To Delete' },
      },
    })

    // Delete it
    const deleteResponse = await request.delete(`/api/indexes?namespace=${TEMP_NAMESPACE}`)
    expect(deleteResponse.status()).toBe(200)

    // Verify gone
    const getResponse = await request.get('/api/indexes')
    const body = await getResponse.json()
    const found = body.indexes.find((i: { namespace: string }) => i.namespace === TEMP_NAMESPACE)
    expect(found).toBeFalsy()
  })
})
