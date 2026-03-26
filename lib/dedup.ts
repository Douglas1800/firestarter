/**
 * Déduplication par similarité Jaccard sur les titres.
 * Fusionne les résultats similaires en gardant le meilleur score
 * et en ajoutant les sources alternatives.
 */

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter(w => w.length > 1)
  )
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const word of setA) {
    if (setB.has(word)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export interface AltSource {
  url: string
  hostname: string
}

export function deduplicateResults<T>(
  items: T[],
  getTitle: (item: T) => string,
  getUrl: (item: T) => string,
  getScore: (item: T) => number,
  threshold: number,
): (T & { altSources?: AltSource[] })[] {
  if (items.length === 0) return []

  const merged = new Set<number>()
  const altSourcesMap = new Map<number, AltSource[]>()

  for (let i = 0; i < items.length; i++) {
    if (merged.has(i)) continue
    for (let j = i + 1; j < items.length; j++) {
      if (merged.has(j)) continue

      const titleI = getTitle(items[i])
      const titleJ = getTitle(items[j])
      if (titleI === 'Untitled' || titleJ === 'Untitled') continue
      const sim = jaccardSimilarity(titleI, titleJ)
      if (sim >= threshold) {
        const scoreI = getScore(items[i])
        const scoreJ = getScore(items[j])

        // Keep the one with the better score
        const [keeper, loser] = scoreI >= scoreJ ? [i, j] : [j, i]
        merged.add(loser)

        const loserUrl = getUrl(items[loser])
        let hostname = ''
        try {
          hostname = new URL(loserUrl.replace(/^(pdf|geocity):\/\//, 'https://')).hostname
        } catch { /* ignore */ }

        const existing = altSourcesMap.get(keeper) || []
        existing.push({ url: loserUrl, hostname })
        altSourcesMap.set(keeper, existing)

        // i lost to j — transfer any accumulated altSources from i, then stop processing i
        if (keeper === j) {
          if (altSourcesMap.has(i)) {
            existing.push(...altSourcesMap.get(i)!)
            altSourcesMap.delete(i)
          }
          break
        }
      }
    }
  }

  return items
    .map((item, idx) => {
      if (merged.has(idx)) return null
      const alts = altSourcesMap.get(idx)
      return alts ? { ...item, altSources: alts } : item
    })
    .filter((item): item is T & { altSources?: AltSource[] } => item !== null)
}
