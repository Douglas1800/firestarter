'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Plus,
  Calendar,
  Globe,
  FileText,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useStorage } from '@/hooks/useStorage'
import type { IndexMetadata, SourceEntry } from '@/lib/storage'

function ManageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const namespace = searchParams.get('namespace')
  const { indexes, refresh: refreshStorage } = useStorage()

  const [index, setIndex] = useState<IndexMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshingSource, setRefreshingSource] = useState<string | null>(null)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [newSourceType, setNewSourceType] = useState<'firecrawl' | 'pdf' | 'geocity'>('firecrawl')
  const [addingSource, setAddingSource] = useState(false)

  // Load index data
  useEffect(() => {
    if (!namespace) {
      router.push('/indexes')
      return
    }

    const found = indexes.find(i => i.namespace === namespace)
    if (found) {
      // Lazy migration: if sources[] is missing, reconstruct from url field
      if (!found.sources || found.sources.length === 0) {
        const urls = found.url.split(' | ').filter(Boolean)
        found.sources = urls.map(u => ({
          url: u,
          type: (u.startsWith('geocity://') ? 'geocity' : u.startsWith('pdf://') ? 'pdf' : 'firecrawl') as 'firecrawl' | 'geocity' | 'pdf',
          lastCrawledAt: found.createdAt || '',
          documentCount: 0,
        }))
      }
      setIndex(found)
      setLoading(false)
    } else if (indexes.length > 0) {
      // Indexes loaded but this one not found
      setLoading(false)
    }
  }, [namespace, indexes, router])

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Jamais'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getSourceLabel = (source: SourceEntry) => {
    if (source.url.startsWith('geocity://')) {
      return 'Agenda Yverdon (geocity.ch API)'
    }
    if (source.type === 'pdf') {
      try {
        const cleanUrl = source.url.replace(/^pdf:\/\//, 'https://')
        return `PDFs de ${new URL(cleanUrl).hostname}`
      } catch { return source.url }
    }
    try {
      return new URL(source.url).hostname
    } catch {
      return source.url
    }
  }

  const getSourceTypeLabel = (source: SourceEntry) => {
    if (source.type === 'geocity') return 'API directe'
    if (source.type === 'pdf') return 'PDF extraction'
    return 'Firecrawl'
  }

  const handleRefreshSource = async (source: SourceEntry) => {
    if (!index || !namespace) return

    setRefreshingSource(source.url)

    try {
      const firecrawlKey = localStorage.getItem('firecrawl_api_key')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (firecrawlKey) headers['X-Firecrawl-API-Key'] = firecrawlKey

      let response

      if (source.type === 'geocity') {
        response = await fetch('/api/firestarter/geocity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            namespace: namespace,
            existingNamespace: namespace,
            isRefresh: true,
          }),
        })
      } else if (source.type === 'pdf') {
        const realUrl = source.url.replace(/^pdf:\/\//, 'https://')
        response = await fetch('/api/firestarter/pdf', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: realUrl,
            namespace: namespace,
            existingNamespace: namespace,
            isRefresh: true,
          }),
        })
      } else {
        response = await fetch('/api/firestarter/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: source.url,
            existingNamespace: namespace,
            isRefresh: true,
          }),
        })
      }

      const data = await response.json()

      if (data.success) {
        const newCount = data.details?.newDocuments ?? 0
        const updatedCount = data.details?.updatedDocuments ?? 0
        toast.success(
          `${getSourceLabel(source)}: ${newCount} nouveaux, ${updatedCount} mis à jour`
        )
        // Refresh data
        await refreshStorage()
      } else {
        toast.error(`Erreur: ${data.error || 'Erreur inconnue'}`)
      }
    } catch {
      toast.error(`Erreur lors du rafraîchissement de ${getSourceLabel(source)}`)
    } finally {
      setRefreshingSource(null)
    }
  }

  const handleRefreshAll = async () => {
    if (!index?.sources || !namespace) return

    setRefreshingAll(true)

    for (const source of index.sources) {
      await handleRefreshSource(source)
    }

    setRefreshingAll(false)
    toast.success('Toutes les sources ont été rafraîchies')
  }

  const handleAddSource = async () => {
    if (!newSourceUrl.trim() || !namespace) return

    let normalizedUrl = newSourceUrl.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('geocity://') && !normalizedUrl.startsWith('pdf://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    // Validate URL
    if (!normalizedUrl.startsWith('geocity://') && !normalizedUrl.startsWith('pdf://')) {
      try {
        new URL(normalizedUrl)
      } catch {
        toast.error('URL invalide')
        return
      }
    }

    // Determine the source type and URL to store
    let sourceType: 'firecrawl' | 'geocity' | 'pdf' = newSourceType
    let storeUrl = normalizedUrl

    if (normalizedUrl.startsWith('geocity://')) {
      sourceType = 'geocity'
    } else if (normalizedUrl.startsWith('pdf://')) {
      sourceType = 'pdf'
    } else if (sourceType === 'pdf') {
      // User selected PDF type with a normal URL -> prefix it
      storeUrl = `pdf://${normalizedUrl.replace(/^https?:\/\//, '')}`
    }

    setAddingSource(true)

    try {
      const response = await fetch('/api/indexes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace,
          action: 'addSource',
          source: {
            url: storeUrl,
            type: sourceType,
          },
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Source ajoutée')
        setNewSourceUrl('')
        await refreshStorage()
      } else {
        toast.error(data.error || 'Erreur')
      }
    } catch {
      toast.error("Erreur lors de l'ajout de la source")
    } finally {
      setAddingSource(false)
    }
  }

  const handleRemoveSource = async (source: SourceEntry) => {
    if (!namespace) return

    if (!confirm(`Supprimer la source ${getSourceLabel(source)} ?`)) return

    try {
      const response = await fetch('/api/indexes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace,
          action: 'removeSource',
          source: { url: source.url },
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Source supprimée')
        await refreshStorage()
      } else {
        toast.error(data.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!index) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Agenda introuvable</h3>
          <p className="text-gray-500 mb-4">Le namespace &quot;{namespace}&quot; n&apos;existe pas.</p>
          <Button asChild variant="outline">
            <Link href="/indexes">Retour aux agendas</Link>
          </Button>
        </div>
      </div>
    )
  }

  const sources = index.sources || []
  const crawlHistory = (index.crawlHistory || []).slice(0, 10)

  return (
    <div className="min-h-screen bg-[#FBFAF9]">
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto font-inter">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#36322F]">
                {index.metadata?.title || 'Agenda'}
              </h1>
              <p className="text-sm text-gray-500 font-mono">{namespace}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard?namespace=${namespace}`}>
              Dashboard
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500">Créé le</p>
              <p className="text-sm font-medium text-[#36322F]">{formatDate(index.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Dernier crawl</p>
              <p className="text-sm font-medium text-[#36322F]">
                {formatDate(index.lastCrawledAt || index.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total documents</p>
              <p className="text-2xl font-bold text-[#36322F]">{index.pagesCrawled}</p>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#36322F]">
              Sources ({sources.length})
            </h2>
          </div>

          {/* Source list */}
          <div className="space-y-3 mb-4">
            {sources.map((source, idx) => {
              const isGeocity = source.type === 'geocity'
              const isPdf = source.type === 'pdf'
              const isRefreshing = refreshingSource === source.url

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 ${
                    isGeocity
                      ? 'bg-green-50 border-green-200'
                      : isPdf
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {isGeocity ? (
                        <Calendar className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : isPdf ? (
                        <FileText className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Globe className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#36322F] truncate">
                          {getSourceLabel(source)}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span className={`px-2 py-0.5 rounded-full ${
                            isGeocity ? 'bg-green-100 text-green-700' : isPdf ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {getSourceTypeLabel(source)}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {source.documentCount} docs
                          </span>
                          {source.lastCrawledAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(source.lastCrawledAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRefreshSource(source)}
                        disabled={isRefreshing || refreshingAll}
                      >
                        {isRefreshing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        <span className="ml-1.5">
                          {isRefreshing ? 'Crawling...' : 'Rafraîchir'}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSource(source)}
                        disabled={isRefreshing || refreshingAll}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}

            {sources.length === 0 && (
              <p className="text-center text-gray-400 py-4">Aucune source configurée</p>
            )}
          </div>

          {/* Add source */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Input
              type="text"
              value={newSourceUrl}
              onChange={(e) => setNewSourceUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddSource()
                }
              }}
              placeholder="https://www.exemple.ch/evenements"
              className="flex-1"
              disabled={addingSource}
            />
            <select
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value as 'firecrawl' | 'pdf' | 'geocity')}
              disabled={addingSource}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="firecrawl">Web</option>
              <option value="pdf">PDF</option>
              <option value="geocity">Geocity</option>
            </select>
            <Button
              onClick={handleAddSource}
              variant="outline"
              disabled={addingSource || !newSourceUrl.trim()}
            >
              {addingSource ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span className="ml-1.5">Ajouter</span>
            </Button>
          </div>
        </div>

        {/* Refresh all button */}
        {sources.length > 0 && (
          <Button
            onClick={handleRefreshAll}
            disabled={refreshingAll || refreshingSource !== null}
            className="w-full mb-6 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl"
          >
            {refreshingAll ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Rafraîchissement en cours...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mr-2" />
                Rafraîchir toutes les sources
              </>
            )}
          </Button>
        )}

        {/* Crawl History */}
        {crawlHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-[#36322F] mb-4">
              Historique des crawls
            </h2>
            <div className="space-y-2">
              {crawlHistory.map((entry, idx) => {
                const sourceLabel = entry.sourceUrl.startsWith('geocity://')
                  ? 'geocity.ch'
                  : entry.sourceUrl.startsWith('pdf://')
                  ? `PDFs ${(() => { try { return new URL(entry.sourceUrl.replace('pdf://', 'https://')).hostname } catch { return entry.sourceUrl } })()}`
                  : (() => {
                      try { return new URL(entry.sourceUrl).hostname } catch { return entry.sourceUrl }
                    })()

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {formatDate(entry.crawledAt)}
                      </span>
                      <span className="text-sm font-medium text-[#36322F]">
                        {sourceLabel}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {entry.newDocuments > 0 ? (
                        <span className="text-green-600 font-medium">
                          +{entry.newDocuments} nouveau{entry.newDocuments > 1 ? 'x' : ''}
                        </span>
                      ) : (
                        <span>0 nouveau</span>
                      )}
                      {entry.updatedDocuments > 0 && (
                        <span className="ml-2 text-blue-600">
                          {entry.updatedDocuments} mis à jour
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ManagePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      }
    >
      <ManageContent />
    </Suspense>
  )
}
