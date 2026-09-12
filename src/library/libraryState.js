export const EMPTY_TITLE_STATE = {
  favorite: false,
  watchlist: false,
  watched: false,
  rating: null,
  watchedAt: null,
  watchedMarkedAt: null,
  note: '',
  titleSnapshot: null,
}

const SUPPORTED_AGE_RATINGS = new Set([0, 6, 12, 16, 18])

/**
 * The public catalog is deliberately refreshed over time. A compact copy of
 * the title is kept with a personal state so a watchlist or rating never
 * disappears merely because that title is no longer in today's discovery
 * rows. It contains public TMDB metadata only, never authentication data.
 */
export function createTitleSnapshot(item) {
  if (!item || typeof item !== 'object' || !item.title) return null

  const ageRating = Number(item.ageRating)
  return {
    id: String(item.id ?? ''),
    tmdbId: Number.isFinite(Number(item.tmdbId)) ? Number(item.tmdbId) : null,
    type: item.type === 'series' ? 'series' : 'movie',
    source: item.source === 'tmdb' ? 'tmdb' : 'fallback',
    title: String(item.title).slice(0, 300),
    originalTitle: item.originalTitle ? String(item.originalTitle).slice(0, 300) : null,
    description: item.description ? String(item.description).slice(0, 2500) : '',
    year: Number.isInteger(item.year) ? item.year : null,
    meta: item.meta ? String(item.meta).slice(0, 120) : '',
    genre: item.genre ? String(item.genre).slice(0, 500) : '',
    score: item.score ? String(item.score).slice(0, 30) : '–',
    posterUrl: item.posterUrl ? String(item.posterUrl) : null,
    backdropUrl: item.backdropUrl ? String(item.backdropUrl) : null,
    ageRating: SUPPORTED_AGE_RATINGS.has(ageRating) ? ageRating : null,
    accent: item.accent ? String(item.accent).slice(0, 32) : '#657184',
    accent2: item.accent2 ? String(item.accent2).slice(0, 32) : '#1c2531',
    providerIds: Array.isArray(item.providerIds) ? item.providerIds.filter(Boolean).map(String).slice(0, 10) : [],
  }
}

export function normalizeTitleSnapshot(value) {
  if (!value || typeof value !== 'object' || typeof value.title !== 'string' || !value.title.trim()) return null

  return createTitleSnapshot(value)
}

export function getTitleStateKey(item) {
  if (!item) return ''

  if (item.tmdbId) {
    const type = item.type === 'series' ? 'tv' : 'movie'
    return `${type}-${item.tmdbId}`
  }

  return String(item.id ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeTitleState(value) {
  const rating = Number.isInteger(value?.rating) && value.rating >= 1 && value.rating <= 10
    ? value.rating
    : null

  return {
    favorite: Boolean(value?.favorite),
    watchlist: Boolean(value?.watchlist),
    watched: Boolean(value?.watched),
    rating,
    watchedAt: typeof value?.watchedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.watchedAt)
      ? value.watchedAt
      : null,
    watchedMarkedAt: typeof value?.watchedMarkedAt === 'string' && Number.isFinite(Date.parse(value.watchedMarkedAt))
      ? value.watchedMarkedAt
      : null,
    note: typeof value?.note === 'string' ? value.note.slice(0, 500) : '',
    titleSnapshot: normalizeTitleSnapshot(value?.titleSnapshot),
  }
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function applyTitleStatePatch(currentValue, patch, date = new Date()) {
  const current = normalizeTitleState(currentValue)
  const next = normalizeTitleState({ ...current, ...patch })

  if (Object.prototype.hasOwnProperty.call(patch, 'watched')) {
    if (next.watched) {
      if (!next.watchedAt) next.watchedAt = localDateValue(date)
      if (!current.watched || !current.watchedMarkedAt || patch.watchedMarkedAt) {
        next.watchedMarkedAt = next.watchedMarkedAt || date.toISOString()
      }
    } else {
      next.watchedAt = null
      next.watchedMarkedAt = null
    }
  }

  return next
}

export function hasPersonalTitleState(value) {
  const state = normalizeTitleState(value)
  return state.favorite || state.watchlist || state.watched || state.rating !== null || Boolean(state.note.trim())
}
