'use client'

import { ExternalLink, MessageSquare, Calendar, FileText, Globe } from 'lucide-react'

export interface SearchResult {
  id: string
  title: string
  url: string
  snippet: string
  score: number
  scoreLabel: string
  sourceType: 'web' | 'pdf' | 'geocity'
  metadata: {
    crawlDate?: string
    description?: string
    startsAt?: string
    location?: string
  }
}

interface SearchResultsProps {
  results: SearchResult[]
  query: string
  onSendToChat: (query: string) => void
}

const SOURCE_BADGE: Record<string, { label: string; bg: string; text: string; icon: typeof Globe }> = {
  web: { label: 'Web', bg: 'bg-blue-100', text: 'text-blue-700', icon: Globe },
  pdf: { label: 'PDF', bg: 'bg-red-100', text: 'text-red-700', icon: FileText },
  geocity: { label: 'Geocity', bg: 'bg-green-100', text: 'text-green-700', icon: Calendar },
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-gray-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600">{pct}%</span>
    </div>
  )
}

export function SearchResults({ results, query, onSendToChat }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-2">Aucun resultat pour &quot;{query}&quot;</p>
        <p className="text-sm text-gray-400">Essayez avec d&apos;autres termes</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        {results.length} resultat{results.length > 1 ? 's' : ''} pour &quot;{query}&quot;
      </p>
      {results.map((result) => {
        const badge = SOURCE_BADGE[result.sourceType] || SOURCE_BADGE.web
        const BadgeIcon = badge.icon

        let hostname = ''
        try {
          const cleanUrl = result.url.replace(/^(pdf|geocity):\/\//, 'https://')
          hostname = new URL(cleanUrl).hostname
        } catch { /* ignore */ }

        const dateStr = result.metadata.crawlDate || result.metadata.startsAt
        const formattedDate = dateStr
          ? new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
          : null

        return (
          <div
            key={result.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-orange-200 hover:shadow-sm transition-all"
          >
            {/* Header: badge + score */}
            <div className="flex items-center justify-between mb-3">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                <BadgeIcon className="w-3 h-3" />
                {badge.label}
              </span>
              <div className="flex items-center gap-3">
                <ScoreBar score={result.score} />
                <span className={`text-xs font-medium ${
                  result.score >= 0.7 ? 'text-green-600' : result.score >= 0.4 ? 'text-yellow-600' : 'text-gray-500'
                }`}>
                  {result.scoreLabel}
                </span>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold text-[#36322F] mb-1 line-clamp-2">
              {result.url && result.url !== '' && !result.url.startsWith('geocity://') ? (
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="hover:text-orange-600 transition-colors">
                  {result.title || 'Sans titre'}
                </a>
              ) : (
                result.title || 'Sans titre'
              )}
            </h3>

            {hostname && (
              <p className="text-xs text-gray-400 mb-2">{hostname}</p>
            )}

            {/* Snippet */}
            {result.snippet && (
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-3">
                {result.snippet}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {formattedDate || ''}
              </span>
              <div className="flex items-center gap-2">
                {result.url && result.url !== '' && !result.url.startsWith('geocity://') && (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ouvrir
                  </a>
                )}
                <button
                  onClick={() => onSendToChat(query)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors"
                >
                  <MessageSquare className="w-3 h-3" />
                  Envoyer au chat
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
