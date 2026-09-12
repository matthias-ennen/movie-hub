import { getTitleStateKey, hasPersonalTitleState } from './libraryState.js'

export const WATCHED_HISTORY_LIMIT = 100

function byTitle(a, b) {
  return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'de')
}

function byRatingDesc(getTitleState) {
  return (a, b) => {
    const aRating = getTitleState(a).rating ?? 0
    const bRating = getTitleState(b).rating ?? 0
    return bRating - aRating || byTitle(a, b)
  }
}

export function buildPersonalRows(titles, getTitleState) {
  if (!Array.isArray(titles) || typeof getTitleState !== 'function') return []

  const definitions = [
    {
      id: 'my-watchlist',
      title: 'Meine Watchlist',
      matches: (state) => state.watchlist,
      sort: byTitle,
    },
    {
      id: 'my-favorites',
      title: 'Meine Favoriten',
      matches: (state) => state.favorite,
      sort: byTitle,
    },
    {
      id: 'my-ratings',
      title: 'Meine Bewertungen',
      matches: (state) => Number.isInteger(state.rating),
      sort: byRatingDesc(getTitleState),
    },
  ]

  return definitions
    .map((definition) => ({
      id: definition.id,
      title: definition.title,
      items: titles
        .filter((item) => definition.matches(getTitleState(item)))
        .sort(definition.sort),
    }))
    .filter((row) => row.items.length > 0)
}

function watchedHistoryTime(state) {
  const markedTime = state?.watchedMarkedAt ? Date.parse(state.watchedMarkedAt) : Number.NaN
  if (Number.isFinite(markedTime)) return markedTime
  const watchedDate = state?.watchedAt ? Date.parse(`${state.watchedAt}T00:00:00Z`) : Number.NaN
  return Number.isFinite(watchedDate) ? watchedDate : 0
}

export function buildWatchedHistoryRows(titles, getTitleState, limit = WATCHED_HISTORY_LIMIT) {
  if (!Array.isArray(titles) || typeof getTitleState !== 'function') return []

  const items = titles
    .filter((item) => getTitleState(item).watched)
    .sort((a, b) => watchedHistoryTime(getTitleState(b)) - watchedHistoryTime(getTitleState(a)) || byTitle(a, b))
    .slice(0, Math.max(0, Number(limit) || 0))

  return items.length ? [{ id: 'my-watched-history', title: 'Als gesehen markiert', items }] : []
}

export function mergeCatalogWithPersonalSnapshots(titles, statesByKey) {
  const merged = new Map()
  for (const item of Array.isArray(titles) ? titles : []) {
    merged.set(getTitleStateKey(item), item)
  }

  for (const state of Object.values(statesByKey || {})) {
    if (!hasPersonalTitleState(state) || !state?.titleSnapshot) continue
    const key = getTitleStateKey(state.titleSnapshot)
    if (key && !merged.has(key)) merged.set(key, state.titleSnapshot)
  }

  return [...merged.values()]
}
