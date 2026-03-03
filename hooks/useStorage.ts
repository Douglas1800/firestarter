import { useState, useEffect } from 'react'
import { IndexMetadata } from '@/lib/storage'

export function useStorage() {
  const [indexes, setIndexes] = useState<IndexMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchIndexes = async (forceSync = false) => {
    setLoading(true)
    setError(null)

    try {
      const url = forceSync ? '/api/indexes?forceSync=true' : '/api/indexes'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch indexes')
      }
      const data = await response.json()
      setIndexes(data.indexes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch indexes')
      setIndexes([])
    } finally {
      setLoading(false)
    }
  }

  const saveIndex = async (index: IndexMetadata) => {
    const response = await fetch('/api/indexes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(index)
    })
    if (!response.ok) {
      throw new Error('Failed to save index')
    }
    await fetchIndexes()
  }

  const updateIndex = async (namespace: string, partial: Partial<IndexMetadata>) => {
    const response = await fetch('/api/indexes')
    if (response.ok) {
      const data = await response.json()
      const existing = (data.indexes || []).find((i: IndexMetadata) => i.namespace === namespace)
      if (existing) {
        const updated = { ...existing, ...partial }
        await fetch('/api/indexes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        })
      }
    }
    await fetchIndexes()
  }

  const deleteIndex = async (namespace: string) => {
    const response = await fetch(`/api/indexes?namespace=${namespace}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error('Failed to delete index')
    }
    await fetchIndexes()
  }

  useEffect(() => {
    fetchIndexes()
  }, [])

  return {
    indexes,
    loading,
    error,
    saveIndex,
    updateIndex,
    deleteIndex,
    refresh: fetchIndexes,
    forceSync: () => fetchIndexes(true),
  }
}
