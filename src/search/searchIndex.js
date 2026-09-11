export const SEARCH_INDEX_VERSION = 1
export const SEARCH_MIN_QUERY_LENGTH = 2
export const SEARCH_RESULT_LIMIT = 60

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de')
    .trim()
}

function normalizeOffer(offer) {
  if (!offer?.id) return null
  return {
    id: offer.id,
    tmdbProviderId: Number.isFinite(Number(offer.tmdbProviderId)) ? Number(offer.tmdbProviderId) : null,
    offerTypes: Array.isArray(offer.offerTypes) ? [...new Set(offer.offerTypes.filter(Boolean))] : [],
  }
}

export function toSearchIndexEntry(title, { scope = 'public' } = {}) {
  if (!title?.id || !title?.title) return null

  const providerOffers = (Array.isArray(title.providerOffers) ? title.providerOffers : [])
    .map(normalizeOffer)
    .filter(Boolean)
  const providerIds = [...new Set([
    ...(Array.isArray(title.providerIds) ? title.providerIds : []),
    ...providerOffers.map((offer) => offer.id),
  ].filter(Boolean))]

  const originalTitle = title.originalTitle || null
  const year = Number.isFinite(Number(title.year)) ? Number(title.year) : null
  const searchText = normalizeText([
    title.title,
    originalTitle,
    year,
  ].filter(Boolean).join(' '))

  return {
    id: title.id,
    tmdbId: Number.isFinite(Number(title.tmdbId)) ? Number(title.tmdbId) : null,
    type: title.type === 'series' ? 'series' : 'movie',
    title: title.title,
    originalTitle,
    year,
    posterUrl: title.posterUrl || null,
    accent: title.accent || '#657184',
    accent2: title.accent2 || '#1c2531',
    providerIds,
    providerOffers,
    searchText,
    scope,
  }
}

export function buildSearchIndexEntries(titles, options = {}) {
  const entries = (Array.isArray(titles) ? titles : [])
    .map((title) => toSearchIndexEntry(title, options))
    .filter(Boolean)

  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
}

export function mergeSearchIndexEntries(publicEntries, personalEntries) {
  const merged = new Map()

  for (const entry of Array.isArray(publicEntries) ? publicEntries : []) {
    if (entry?.id) merged.set(entry.id, entry)
  }

  for (const personalEntry of Array.isArray(personalEntries) ? personalEntries : []) {
    if (!personalEntry?.id) continue
    const current = merged.get(personalEntry.id)
    if (!current) {
      merged.set(personalEntry.id, { ...personalEntry, scope: 'personal' })
      continue
    }

    const providerOffers = new Map()
    for (const offer of [...(current.providerOffers || []), ...(personalEntry.providerOffers || [])]) {
      if (!offer?.id) continue
      const existing = providerOffers.get(offer.id)
      providerOffers.set(offer.id, existing
        ? {
            ...existing,
            ...offer,
            offerTypes: [...new Set([...(existing.offerTypes || []), ...(offer.offerTypes || [])])],
          }
        : { ...offer, offerTypes: [...(offer.offerTypes || [])] })
    }

    merged.set(personalEntry.id, {
      ...current,
      ...personalEntry,
      scope: 'personal',
      providerOffers: [...providerOffers.values()],
      providerIds: [...new Set([...(current.providerIds || []), ...(personalEntry.providerIds || [])])],
    })
  }

  return [...merged.values()]
}

function matchScore(entry, normalizedQuery) {
  const title = normalizeText(entry.title)
  const originalTitle = normalizeText(entry.originalTitle)
  const haystack = entry.searchText || normalizeText(`${entry.title || ''} ${entry.originalTitle || ''} ${entry.year || ''}`)

  if (!haystack.includes(normalizedQuery)) return -1
  if (title === normalizedQuery) return 1000
  if (title.startsWith(normalizedQuery)) return 800
  if (originalTitle === normalizedQuery) return 700
  if (originalTitle.startsWith(normalizedQuery)) return 600
  return 100
}

export function searchIndex(entries, query, {
  enabledProviderIds = null,
  limit = SEARCH_RESULT_LIMIT,
} = {}) {
  const normalizedQuery = normalizeText(query)
  if (normalizedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
    return { results: [], total: 0, hasMore: false }
  }

  const enabled = Array.isArray(enabledProviderIds) ? new Set(enabledProviderIds) : null
  const scored = []

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.id) continue

    if (entry.scope !== 'personal' && enabled) {
      const providerIds = Array.isArray(entry.providerIds) ? entry.providerIds : []
      if (!providerIds.some((providerId) => enabled.has(providerId))) continue
    }

    const score = matchScore(entry, normalizedQuery)
    if (score < 0) continue
    scored.push({ entry, score })
  }

  scored.sort((left, right) => (
    right.score - left.score
    || String(left.entry.title || '').localeCompare(String(right.entry.title || ''), 'de')
    || Number(right.entry.year || 0) - Number(left.entry.year || 0)
  ))

  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : SEARCH_RESULT_LIMIT
  return {
    results: scored.slice(0, safeLimit).map(({ entry }) => entry),
    total: scored.length,
    hasMore: scored.length > safeLimit,
  }
}

export function buildSearchIndexArtifact(catalog) {
  const entries = buildSearchIndexEntries(catalog?.titles, { scope: 'public' })
  return {
    source: catalog?.source || 'tmdb',
    kind: 'search-index',
    version: SEARCH_INDEX_VERSION,
    language: catalog?.language || 'de-DE',
    country: catalog?.country || 'DE',
    generatedAt: catalog?.generatedAt || new Date().toISOString(),
    attribution: catalog?.attribution || null,
    providerAttribution: catalog?.providerAttribution || null,
    count: entries.length,
    entries,
  }
}
