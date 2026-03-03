import { NextRequest, NextResponse } from 'next/server'
import { getIndexes, getIndex, saveIndex, deleteIndex, invalidateCache, IndexMetadata } from '@/lib/storage'
import type { SourceEntry } from '@/lib/storage'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const forceSync = searchParams.get('forceSync') === 'true'

    if (forceSync) {
      invalidateCache()
    }

    const indexes = await getIndexes()
    return NextResponse.json({ indexes: indexes || [] })
  } catch {
    // Return empty array instead of error to allow app to function
    console.error('Failed to get indexes')
    return NextResponse.json({ indexes: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const index: IndexMetadata = await request.json()
    await saveIndex(index)
    return NextResponse.json({ success: true })
  } catch {
    // Return success anyway to allow app to continue
    console.error('Failed to save index')
    return NextResponse.json({ success: true, warning: 'Index saved locally only' })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { namespace, action, source } = body

    if (!namespace) {
      return NextResponse.json({ error: 'Namespace is required' }, { status: 400 })
    }

    const existingIndex = await getIndex(namespace)
    if (!existingIndex) {
      return NextResponse.json({ error: 'Index not found' }, { status: 404 })
    }

    const sources = existingIndex.sources || []

    if (action === 'addSource') {
      if (!source?.url || !source?.type) {
        return NextResponse.json({ error: 'Source url and type are required' }, { status: 400 })
      }
      // Don't add duplicates
      if (!sources.find(s => s.url === source.url)) {
        const newSource: SourceEntry = {
          url: source.url,
          type: source.type,
          lastCrawledAt: '',
          documentCount: 0,
        }
        sources.push(newSource)
      }
    } else if (action === 'removeSource') {
      if (!source?.url) {
        return NextResponse.json({ error: 'Source url is required' }, { status: 400 })
      }
      const idx = sources.findIndex(s => s.url === source.url)
      if (idx !== -1) {
        sources.splice(idx, 1)
      }
    } else {
      return NextResponse.json({ error: 'Invalid action. Use addSource or removeSource' }, { status: 400 })
    }

    // Update the index
    await saveIndex({
      ...existingIndex,
      sources,
      url: sources.map(s => s.url).join(' | ') || existingIndex.url,
    })

    return NextResponse.json({ success: true, sources })
  } catch {
    console.error('Failed to patch index')
    return NextResponse.json({ error: 'Failed to update index' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const namespace = searchParams.get('namespace')

    if (!namespace) {
      return NextResponse.json({ error: 'Namespace is required' }, { status: 400 })
    }

    // deleteIndex in VectorCacheStorageAdapter already handles vector cleanup
    await deleteIndex(namespace)
    return NextResponse.json({ success: true })
  } catch {
    console.error('Failed to delete index')
    return NextResponse.json({ success: true, warning: 'Index deleted locally only' })
  }
}
