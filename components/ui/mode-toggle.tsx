'use client'

import { Search, MessageSquare } from 'lucide-react'

interface ModeToggleProps {
  mode: 'chat' | 'search'
  onChange: (mode: 'chat' | 'search') => void
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex p-1 bg-gray-100 rounded-lg">
      <button
        type="button"
        onClick={() => onChange('chat')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
          mode === 'chat'
            ? 'bg-white text-orange-600 shadow-sm'
            : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Chat IA
      </button>
      <button
        type="button"
        onClick={() => onChange('search')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
          mode === 'search'
            ? 'bg-white text-orange-600 shadow-sm'
            : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        Recherche
      </button>
    </div>
  )
}
