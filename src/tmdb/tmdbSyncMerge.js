import { nativeTitleToFirestore } from './tmdbCatalogModel.js'

const DEFINITIONS = [
  { id: 'favorite_movies', label: 'Favoriten Filme', mediaType: 'movie', flag: 'favorite', orderField: 'favoriteOrder' },
  { id: 'favorite_tv', label: 'Favoriten Serien', mediaType: 'tv', flag: 'favorite', orderField: 'favoriteOrder' },
  { id: 'watchlist_movies', label: 'Watchlist Filme', mediaType: 'movie', flag: 'watchlist', orderField: 'watchlistOrder' },
  { id: 'watchlist_tv', label: 'Watchlist Serien', mediaType: 'tv', flag: 'watchlist', orderField: 'watchlistOrder' },
  { id: 'rated_movies', label: 'Bewertungen Filme', mediaType: 'movie', flag: 'rated', orderField: 'ratingOrder', rating: true },
  { id: 'rated_tv', label: 'Bewertungen Serien', mediaType: 'tv', flag: 'rated', orderField: 'ratingOrder', rating: true },
]

function mediaTypeOf(value) {
  if (value?.mediaType === 'movie' || value?.type === 'movie') return 'movie'
  if (value?.mediaType === 'tv' || value?.type === 'series' || value?.type === 'tv') return 'tv'
  return null
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeTmdbSyncSections(rawSections) {
  const reported = Array.isArray(rawSections) && rawSections.length > 0
  const byId = new Map((reported ? rawSections : [])
    .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => [item.id, item]))

  return DEFINITIONS.map((definition) => {
    const raw = byId.get(definition.id)
    // Backward compatibility: APKs from before the partial-sync protocol only
    // deliver a payload after all six list requests have succeeded.
    const ok = reported ? raw?.ok === true : true
    return {
      ...definition,
      ok,
      count: ok ? finiteNumber(raw?.count) : null,
      retried: raw?.retried === true,
      preserved: !ok,
      error: !ok && raw?.error ? String(raw.error).slice(0, 220) : null,
      reported,
    }
  })
}

function sectionFor(sections, mediaType, flag) {
  return sections.find((section) => section.mediaType === mediaType && section.flag === flag)
}

function preserveMembership(next, current, incoming, section) {
  const flag = section.flag
  const orderField = section.orderField

  if (section.ok) {
    const active = incoming?.[flag] === true
    next[flag] = active
    next[orderField] = active ? finiteNumber(incoming?.[orderField]) : null
    if (section.rating) {
      next.ratingValue = active ? finiteNumber(incoming?.ratingValue) : null
    }
    return
  }

  const active = current?.[flag] === true
  next[flag] = active
  next[orderField] = active ? finiteNumber(current?.[orderField] ?? current?.ratedOrder) : null
  if (section.rating) {
    next.ratingValue = active ? finiteNumber(current?.ratingValue) : null
  }
}

function hasMembership(item) {
  return item?.favorite === true || item?.watchlist === true || item?.rated === true
}

function identityFromDocumentKey(id) {
  const match = String(id || '').match(/^(movie|tv):(\d+)$/)
  if (!match) return null
  return {
    mediaType: match[1],
    tmdbId: Number(match[2]),
  }
}

function canonicalDocument(item, id) {
  const keyIdentity = identityFromDocumentKey(id)
  const explicitTmdbId = finiteNumber(item?.tmdbId)
  const canonicalInput = {
    ...item,
    mediaType: mediaTypeOf(item) || keyIdentity?.mediaType || null,
    tmdbId: explicitTmdbId ?? keyIdentity?.tmdbId ?? null,
  }
  const data = nativeTitleToFirestore(canonicalInput, item?.syncedAt || null)
  return { id, ...data }
}

export function mergeTmdbSyncDocuments(currentDocuments = [], incomingDocuments = [], rawSections = null) {
  const sections = normalizeTmdbSyncSections(rawSections)
  const currentByKey = new Map((Array.isArray(currentDocuments) ? currentDocuments : [])
    .filter((item) => item?.id)
    .map((item) => [item.id, { ...item }]))
  const incomingByKey = new Map((Array.isArray(incomingDocuments) ? incomingDocuments : [])
    .filter((item) => item?.id)
    .map((item) => [item.id, { ...item }]))
  const keys = new Set([...currentByKey.keys(), ...incomingByKey.keys()])
  const documents = []

  for (const key of keys) {
    const current = currentByKey.get(key) || null
    const incoming = incomingByKey.get(key) || null
    const mediaType = mediaTypeOf(incoming) || mediaTypeOf(current)
    if (!mediaType) continue

    const next = incoming ? { ...(current || {}), ...incoming, id: key } : { ...current, id: key }
    for (const flag of ['favorite', 'watchlist', 'rated']) {
      const section = sectionFor(sections, mediaType, flag)
      if (section) preserveMembership(next, current, incoming, section)
    }

    if (hasMembership(next)) documents.push(canonicalDocument(next, key))
  }

  const counts = {
    favorite: documents.filter((item) => item.favorite === true).length,
    watchlist: documents.filter((item) => item.watchlist === true).length,
    rated: documents.filter((item) => item.rated === true).length,
    total: documents.length,
  }

  return {
    documents,
    sections,
    counts,
    partial: sections.some((section) => !section.ok),
    successfulSections: sections.filter((section) => section.ok).length,
    totalSections: sections.length,
  }
}

export function formatTmdbSyncSummary(rawSections) {
  const sections = normalizeTmdbSyncSections(rawSections)
  if (!sections.some((section) => section.reported)) return null

  const successful = sections.filter((section) => section.ok).length
  const details = sections.map((section) => {
    if (section.ok) {
      const retry = section.retried ? ' (nach Wiederholung)' : ''
      return `✓ ${section.label}: ${section.count ?? 0}${retry}`
    }
    const reason = section.error ? ` (${section.error})` : ''
    return `⚠ ${section.label}: nicht aktualisiert${reason} – bisheriger Stand beibehalten`
  })
  return `${successful} von ${sections.length} Bereichen aktualisiert. ${details.join(' · ')}`
}
