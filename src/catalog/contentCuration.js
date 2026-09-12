import { stableStringHash } from './contentDisplaySettings.js'

export const PUBLIC_POSTER_ROW_LIMIT = 40
export const TOP_RATED_MINIMUM_VOTES = 50

function finiteNumber(value, fallback = Number.NEGATIVE_INFINITY) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function titleKey(item) {
  return `${item?.type === 'series' ? 'series' : 'movie'}:${item?.tmdbId ?? item?.id ?? ''}`
}

function uniqueTitles(items) {
  const unique = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const key = titleKey(item)
    if (!item?.id || !item?.title || key.endsWith(':') || unique.has(key)) continue
    unique.set(key, item)
  }
  return [...unique.values()]
}

function compareTitle(a, b) {
  return String(a?.title || '').localeCompare(String(b?.title || ''), 'de')
}

function comparePopular(a, b) {
  return finiteNumber(b?.popularity) - finiteNumber(a?.popularity)
    || finiteNumber(b?.voteCount, 0) - finiteNumber(a?.voteCount, 0)
    || finiteNumber(b?.voteAverage, 0) - finiteNumber(a?.voteAverage, 0)
    || finiteNumber(b?.year, 0) - finiteNumber(a?.year, 0)
    || compareTitle(a, b)
}

function releaseTime(item) {
  const value = item?.releaseDate || item?.firstAirDate || item?.date || null
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(time) ? time : finiteNumber(item?.year, 0) * 366 * 86400000
}

function compareNewest(a, b) {
  return releaseTime(b) - releaseTime(a)
    || comparePopular(a, b)
}

function compareTopRated(a, b) {
  const aVotes = finiteNumber(a?.voteCount, 0)
  const bVotes = finiteNumber(b?.voteCount, 0)
  const aQualified = aVotes >= TOP_RATED_MINIMUM_VOTES
  const bQualified = bVotes >= TOP_RATED_MINIMUM_VOTES
  return Number(bQualified) - Number(aQualified)
    || finiteNumber(b?.voteAverage, 0) - finiteNumber(a?.voteAverage, 0)
    || bVotes - aVotes
    || comparePopular(a, b)
}

function deterministicCompare(seed) {
  return (a, b) => stableStringHash(`${seed}:${titleKey(a)}`) - stableStringHash(`${seed}:${titleKey(b)}`)
    || comparePopular(a, b)
}

function interleaveRankings(items, seed) {
  const rankings = [
    [...items].sort(comparePopular),
    [...items].sort(compareNewest),
    [...items].sort(compareTopRated),
    [...items].sort(deterministicCompare(`${seed}:variety`)),
  ]
  const start = stableStringHash(`${seed}:balanced`) % rankings.length
  const cursors = rankings.map(() => 0)
  const selected = new Set()
  const result = []

  while (result.length < items.length) {
    let added = false
    for (let step = 0; step < rankings.length; step += 1) {
      const rankIndex = (start + step) % rankings.length
      const ranking = rankings[rankIndex]
      while (cursors[rankIndex] < ranking.length) {
        const item = ranking[cursors[rankIndex]]
        cursors[rankIndex] += 1
        const key = titleKey(item)
        if (selected.has(key)) continue
        selected.add(key)
        result.push(item)
        added = true
        break
      }
    }
    if (!added) break
  }

  return result
}

function sortTitles(items, mode, seed) {
  switch (mode) {
    case 'popular': return [...items].sort(comparePopular)
    case 'newest': return [...items].sort(compareNewest)
    case 'top-rated': return [...items].sort(compareTopRated)
    case 'discover': {
      const qualityPool = [...items].sort(compareTopRated)
      const qualityRank = new Map(qualityPool.map((item, index) => [titleKey(item), index]))
      const bucketSize = Math.max(6, Math.ceil(qualityPool.length / 5))
      const varied = deterministicCompare(`${seed}:discover`)
      return qualityPool.sort((a, b) => (
        Math.floor(qualityRank.get(titleKey(a)) / bucketSize) - Math.floor(qualityRank.get(titleKey(b)) / bucketSize)
        || varied(a, b)
      ))
    }
    case 'balanced':
    default: return interleaveRankings(items, seed)
  }
}

function isWatched(item, getTitleState) {
  try {
    return Boolean(getTitleState?.(item)?.watched)
  } catch {
    return false
  }
}

function applyWatchedMode(items, watchedMode, getTitleState) {
  if (watchedMode === 'hide') return items.filter((item) => !isWatched(item, getTitleState))
  if (watchedMode !== 'demote') return items

  const unseen = []
  const watched = []
  for (const item of items) (isWatched(item, getTitleState) ? watched : unseen).push(item)
  return [...unseen, ...watched]
}

export function curateTitles(items, {
  mode = 'balanced',
  seed = 'movie-hub',
  watchedMode = 'normal',
  getTitleState = null,
  preserveOrder = false,
  limit = Number.POSITIVE_INFINITY,
} = {}) {
  const unique = uniqueTitles(items)
  const visible = watchedMode === 'hide'
    ? applyWatchedMode(unique, watchedMode, getTitleState)
    : unique
  const ranked = preserveOrder ? visible : sortTitles(visible, mode, seed)
  const watchedAdjusted = watchedMode === 'demote'
    ? applyWatchedMode(ranked, watchedMode, getTitleState)
    : ranked
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : watchedAdjusted.length
  return watchedAdjusted.slice(0, safeLimit)
}

export function curateCatalogRows(rows, options = {}) {
  const semanticRowIds = new Set(options.semanticRowIds || ['trending', 'new-movies', 'new-series'])
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      ...row,
      items: curateTitles(row?.items, {
        ...options,
        seed: `${options.seed || 'movie-hub'}:${row?.id || row?.title || 'row'}`,
        preserveOrder: semanticRowIds.has(row?.id),
        limit: options.limit ?? row?.displayLimit ?? row?.items?.length ?? PUBLIC_POSTER_ROW_LIMIT,
      }),
    }))
    .filter((row) => row.items.length)
}

export function hasEnabledAvailability(item, enabledProviderIds, hasMovieHubTitle = null) {
  const enabled = new Set(Array.isArray(enabledProviderIds) ? enabledProviderIds : [])
  if (enabled.has('moviehub') && hasMovieHubTitle?.(item)) return true
  return (Array.isArray(item?.providerIds) ? item.providerIds : [])
    .some((providerId) => enabled.has(providerId))
}
