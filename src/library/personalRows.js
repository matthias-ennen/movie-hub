function byTitle(a, b) {
  return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'de')
}

function byWatchedDateDesc(getTitleState) {
  return (a, b) => {
    const aDate = getTitleState(a).watchedAt ?? ''
    const bDate = getTitleState(b).watchedAt ?? ''
    return bDate.localeCompare(aDate) || byTitle(a, b)
  }
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
      title: 'Favoriten',
      matches: (state) => state.favorite,
      sort: byTitle,
    },
    {
      id: 'my-watched',
      title: 'Gesehen',
      matches: (state) => state.watched,
      sort: byWatchedDateDesc(getTitleState),
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
import { getTitleStateKey, hasPersonalTitleState } from './libraryState.js'
