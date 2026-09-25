import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'
import { mergeEnrichedTitle } from '../catalog/titleMetadata.js'
import { getTitleStateKey, hasPersonalTitleState } from './libraryState.js'

export const WATCHED_HISTORY_LIMIT = 70
export const PERSONAL_TOP_HUNDRED_LIMIT = 100

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

export function buildPersonalRows(titles, getTitleState, limit = getActivePosterRowLimit()) {
  if (!Array.isArray(titles) || typeof getTitleState !== 'function') return []
  const safeLimit = Math.min(Math.max(0, Number(limit) || 0), getActivePosterRowLimit())

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
        .sort(definition.sort)
        .slice(0, safeLimit),
    }))
    .filter((row) => row.items.length > 0)
}

/** Keep personal ratings distinct from unreviewed recommendation candidates. */
export function buildPersonalTopHundredRows(titles, getTitleState, rowLimit = getActivePosterRowLimit()) {
  if (!Array.isArray(titles) || typeof getTitleState !== 'function') return []
  const pageSize = Math.min(50, Math.max(0, Number(rowLimit) || 0), getActivePosterRowLimit())
  if (!pageSize) return []

  const unique = new Map()
  for (const item of titles) {
    const key = getTitleStateKey(item)
    if (!key || unique.has(key)) continue
    const rating = getTitleState(item)?.rating
    if (Number.isInteger(rating) && rating >= 1 && rating <= 10) unique.set(key, { item, rating })
  }
  const ranked = [...unique.values()]
    .sort((a, b) => b.rating - a.rating || byTitle(a.item, b.item)
      || getTitleStateKey(a.item).localeCompare(getTitleStateKey(b.item)))
    .slice(0, PERSONAL_TOP_HUNDRED_LIMIT)

  const rows = []
  for (let start = 0; start < ranked.length; start += pageSize) {
    const end = Math.min(start + pageSize, ranked.length)
    rows.push({
      id: `my-top-100-${start + 1}`,
      title: `Meine Top 100 · Plätze ${start + 1}–${end}`,
      items: ranked.slice(start, end).map(({ item }) => item),
    })
  }
  return rows
}

function watchedHistoryTime(state) {
  const markedTime = state?.watchedMarkedAt ? Date.parse(state.watchedMarkedAt) : Number.NaN
  if (Number.isFinite(markedTime)) return markedTime
  const watchedDate = state?.watchedAt ? Date.parse(`${state.watchedAt}T00:00:00Z`) : Number.NaN
  return Number.isFinite(watchedDate) ? watchedDate : 0
}

export function buildWatchedHistoryRows(titles, getTitleState, limit = getActivePosterRowLimit()) {
  if (!Array.isArray(titles) || typeof getTitleState !== 'function') return []
  const safeLimit = Math.min(Math.max(0, Number(limit) || 0), getActivePosterRowLimit())

  const items = titles
    .filter((item) => getTitleState(item).watched)
    .sort((a, b) => watchedHistoryTime(getTitleState(b)) - watchedHistoryTime(getTitleState(a)) || byTitle(a, b))
    .slice(0, safeLimit)

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
    if (!key) continue

    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, state.titleSnapshot)
      continue
    }

    const existingVersion = Number(existing.metadataVersion) || 0
    const snapshotVersion = Number(state.titleSnapshot.metadataVersion) || 0
    const existingUpdatedAt = Date.parse(existing.metadataUpdatedAt || '') || 0
    const snapshotUpdatedAt = Date.parse(state.titleSnapshot.metadataUpdatedAt || '') || 0
    const snapshotIsNewer = snapshotVersion > existingVersion
      || (snapshotVersion === existingVersion && snapshotUpdatedAt > existingUpdatedAt)
    const primary = snapshotIsNewer ? state.titleSnapshot : existing
    const secondary = snapshotIsNewer ? existing : state.titleSnapshot
    const enriched = mergeEnrichedTitle(primary, secondary)

    merged.set(key, {
      ...enriched,
      id: existing.id,
      source: existing.source || enriched.source,
      scope: existing.scope ?? enriched.scope,
    })
  }

  return [...merged.values()]
}
