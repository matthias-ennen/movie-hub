export const EMPTY_TITLE_STATE = {
  favorite: false,
  watchlist: false,
  watched: false,
  rating: null,
  watchedAt: null,
  note: '',
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
    note: typeof value?.note === 'string' ? value.note.slice(0, 500) : '',
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
    if (next.watched && !next.watchedAt) next.watchedAt = localDateValue(date)
    if (!next.watched) next.watchedAt = null
  }

  return next
}

export function hasPersonalTitleState(value) {
  const state = normalizeTitleState(value)
  return state.favorite || state.watchlist || state.watched || state.rating !== null || Boolean(state.note.trim())
}
