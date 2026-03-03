import { NextRequest, NextResponse } from 'next/server'
import { searchIndex, getExistingIds } from '@/lib/upstash-search'
import { saveIndex, getIndex, invalidateCache } from '@/lib/storage'
import type { SourceEntry, CrawlHistoryEntry } from '@/lib/storage'

interface GeocityEvent {
  type: string
  properties: {
    id: number
    title?: string
    summary?: string
    starts_at: string
    ends_at: string
    location?: string
    location_details?: string
    pricing?: string
    schedule?: string
    website?: string
    status?: string | null
    featured?: boolean
    publics?: string[]
    genre_evenement?: string[]
    categories?: Record<string, unknown>
    organizer_name?: string
    organizer_phone?: string
    organizer_email?: string
    organizer_website?: string
    organizer_address?: string
    poster?: {
      src: string
      width: number
      height: number
    }
  }
}

interface GeocityListResponse {
  type: string
  count: number
  next: string | null
  previous: string | null
  features: GeocityEvent[]
  filters: unknown
}

const GEOCITY_API = 'https://yverdon.geocity.ch/rest'
const GEOCITY_SOURCE_URL = 'geocity://yverdon'

function formatDate(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleTimeString('fr-CH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function eventToMarkdown(event: GeocityEvent['properties']): string {
  const lines: string[] = []

  lines.push(`# ${event.title || 'Événement sans titre'}`)
  lines.push('')

  // Dates
  const startDate = formatDate(event.starts_at)
  const endDate = formatDate(event.ends_at)
  const startTime = formatTime(event.starts_at)
  const endTime = formatTime(event.ends_at)

  if (startDate === endDate) {
    lines.push(`**Date:** ${startDate}`)
    lines.push(`**Horaire:** ${startTime} - ${endTime}`)
  } else {
    lines.push(`**Du:** ${startDate} à ${startTime}`)
    lines.push(`**Au:** ${endDate} à ${endTime}`)
  }

  if (event.schedule) {
    lines.push(`**Programme:** ${event.schedule}`)
  }

  lines.push('')

  // Location
  if (event.location_details) {
    lines.push(`**Lieu:** ${event.location_details}`)
  }
  if (event.location) {
    lines.push(`**Adresse:** ${event.location}`)
  }

  // Summary
  if (event.summary) {
    lines.push('')
    lines.push(`## Description`)
    lines.push(event.summary)
  }

  // Pricing
  if (event.pricing) {
    lines.push('')
    lines.push(`**Prix:** ${event.pricing}`)
  }

  // Categories
  if (event.genre_evenement && event.genre_evenement.length > 0) {
    lines.push(`**Type:** ${event.genre_evenement.join(', ')}`)
  }
  if (event.publics && event.publics.length > 0) {
    lines.push(`**Public:** ${event.publics.join(', ')}`)
  }

  // Organizer
  if (event.organizer_name) {
    lines.push('')
    lines.push(`## Organisateur`)
    lines.push(`**Nom:** ${event.organizer_name}`)
    if (event.organizer_phone) lines.push(`**Téléphone:** ${event.organizer_phone}`)
    if (event.organizer_email) lines.push(`**Email:** ${event.organizer_email}`)
    if (event.organizer_website) lines.push(`**Site web:** ${event.organizer_website}`)
  }

  // Website
  if (event.website) {
    lines.push('')
    lines.push(`**Plus d'infos:** ${event.website}`)
  }

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { namespace, existingNamespace, isRefresh = false } = body

    const targetNamespace = existingNamespace || namespace || `agenda-yverdon-${Date.now()}`

    // Build prefix for geocity documents
    const sourcePrefix = `${targetNamespace}-geocity-`

    // Get existing IDs before upsert (for counting new vs updated)
    let existingIds = new Set<string>()
    if (isRefresh) {
      existingIds = await getExistingIds(sourcePrefix)
    }

    // Fetch all events from geocity API (paginated)
    const allEvents: GeocityEvent[] = []
    let nextUrl: string | null = `${GEOCITY_API}/agenda?pageSize=100`

    while (nextUrl) {
      const response = await fetch(nextUrl)
      if (!response.ok) {
        throw new Error(`Geocity API error: ${response.status}`)
      }

      const data: GeocityListResponse = await response.json()
      allEvents.push(...data.features)
      nextUrl = data.next
    }

    console.log(`Fetched ${allEvents.length} events from geocity.ch`)

    // Fetch full details for events that have titles
    const eventsWithDetails: GeocityEvent[] = []

    const batchSize = 10
    for (let i = 0; i < allEvents.length; i += batchSize) {
      const batch = allEvents.slice(i, i + batchSize)
      const detailPromises = batch.map(async (event) => {
        if (!event.properties.title && !event.properties.summary) {
          try {
            const detailRes = await fetch(`${GEOCITY_API}/agenda/${event.properties.id}`)
            if (detailRes.ok) {
              const detail: GeocityEvent = await detailRes.json()
              return detail
            }
          } catch {
            // Skip events that fail to fetch
          }
        }
        return event
      })

      const results = await Promise.all(detailPromises)
      eventsWithDetails.push(...results)
    }

    // Filter to events that have at least a title
    const validEvents = eventsWithDetails.filter(
      (e) => e.properties.title
    )

    console.log(`${validEvents.length} events with titles out of ${allEvents.length} total`)

    // Convert events to documents for Upstash Vector (IDs already stable: geocity-{eventId})
    const documents = validEvents.map((event) => {
      const props = event.properties
      const markdown = eventToMarkdown(props)
      const title = props.title || 'Événement sans titre'

      const searchableText = `${title} ${props.summary || ''} ${props.location_details || ''} ${props.genre_evenement?.join(' ') || ''} ${formatDate(props.starts_at)} ${markdown}`.substring(0, 4000)

      return {
        id: `${targetNamespace}-geocity-${props.id}`,
        content: {
          text: searchableText,
          url: props.website || `https://www.yverdon-les-bains.ch/agenda`,
          title: title,
        },
        metadata: {
          namespace: targetNamespace,
          title: title,
          url: props.website || `https://www.yverdon-les-bains.ch/agenda`,
          sourceURL: `https://yverdon.geocity.ch/rest/agenda/${props.id}`,
          crawlDate: new Date().toISOString(),
          pageTitle: title,
          description: props.summary?.substring(0, 200) || '',
          source: 'geocity.ch',
          eventId: props.id,
          startsAt: props.starts_at,
          endsAt: props.ends_at,
          location: props.location_details || '',
          pricing: props.pricing || '',
          fullContent: markdown.substring(0, 10000),
        },
      }
    })

    // Count new vs updated documents
    let newDocuments = 0
    let updatedDocuments = 0

    if (isRefresh) {
      for (const doc of documents) {
        if (existingIds.has(doc.id)) {
          updatedDocuments++
        } else {
          newDocuments++
        }
      }
    }

    // Index documents in Upstash Vector
    const indexBatchSize = 10
    for (let i = 0; i < documents.length; i += indexBatchSize) {
      const batch = documents.slice(i, i + indexBatchSize)
      await searchIndex.upsert(batch)
    }

    console.log(`Indexed ${documents.length} events in namespace: ${targetNamespace}`)

    // Save index metadata
    const now = new Date().toISOString()

    try {
      const existingIndex = await getIndex(targetNamespace)

      // Build source entry
      const sourceEntry: SourceEntry = {
        url: GEOCITY_SOURCE_URL,
        type: 'geocity',
        lastCrawledAt: now,
        documentCount: documents.length,
      }

      // Build crawl history entry
      const crawlHistoryEntry: CrawlHistoryEntry = {
        crawledAt: now,
        sourceUrl: GEOCITY_SOURCE_URL,
        documentsFound: documents.length,
        newDocuments: isRefresh ? newDocuments : documents.length,
        updatedDocuments: isRefresh ? updatedDocuments : 0,
      }

      if (existingIndex) {
        // Update existing index
        const existingSources = existingIndex.sources || []

        // Update or add source entry
        const sourceIdx = existingSources.findIndex(s => s.url === GEOCITY_SOURCE_URL)
        if (sourceIdx !== -1) {
          existingSources[sourceIdx] = sourceEntry
        } else {
          existingSources.push(sourceEntry)
        }

        // Build crawl history (keep last 20)
        const crawlHistory = existingIndex.crawlHistory || []
        crawlHistory.unshift(crawlHistoryEntry)
        const limitedHistory = crawlHistory.slice(0, 20)

        // Recalculate total pages from all sources
        const totalPages = existingSources.reduce((sum, s) => sum + s.documentCount, 0)

        await saveIndex({
          ...existingIndex,
          url: existingSources.map(s => s.url).join(' | '),
          pagesCrawled: totalPages,
          sources: existingSources,
          lastCrawledAt: now,
          crawlHistory: limitedHistory,
        })
      } else {
        await saveIndex({
          url: 'https://yverdon.geocity.ch/rest/agenda',
          namespace: targetNamespace,
          pagesCrawled: documents.length,
          createdAt: now,
          metadata: {
            title: 'Agenda Yverdon-les-Bains (geocity.ch)',
            description: `${documents.length} événements importés depuis l'API geocity.ch`,
            favicon: 'https://www.yverdon-les-bains.ch/favicon.ico',
          },
          sources: [sourceEntry],
          lastCrawledAt: now,
          crawlHistory: [crawlHistoryEntry],
        })
      }
    } catch {
      console.warn('Failed to save index metadata (storage adapter may not be configured)')
    }

    invalidateCache()

    return NextResponse.json({
      success: true,
      namespace: targetNamespace,
      isRefresh,
      message: isRefresh
        ? `Refresh terminé: ${newDocuments} nouveaux, ${updatedDocuments} mis à jour`
        : `${documents.length} événements importés depuis geocity.ch`,
      details: {
        totalEvents: allEvents.length,
        eventsWithTitle: validEvents.length,
        eventsIndexed: documents.length,
        source: 'geocity.ch REST API',
        newDocuments: isRefresh ? newDocuments : undefined,
        updatedDocuments: isRefresh ? updatedDocuments : undefined,
      },
    })
  } catch (error) {
    console.error('Geocity import failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to import events from geocity.ch',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
