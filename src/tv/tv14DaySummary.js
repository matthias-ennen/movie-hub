import { nextTvAiringTransition } from '../waipu/waipuAiringStatus.js'
import { fetchJsonWithTimeout } from '../performance/fetchJson.js'
import { mapCooperatively, reuseRows, throwIfAborted } from '../performance/cooperativeWork.js'
import { createLiveProviderFilter } from '../sources/liveProviderSelection.js'
import { selectProviderMap } from '../sources/providerLiveRoute.js'
import { mergeProviderOffers } from '../providers/providerOfferSnapshot.js'
import { resolvePresentationArtwork } from '../catalog/artworkRotation.js'

export const TV_14_DAY_SUMMARY_URL = '/tv-14-days-summary.json'
export const TV_14_DAY_SUMMARY_VERSION = 1
export const TV_14_DAY_ROW_LIMIT = 70

const TV_GENRE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'action-adventure', title: 'Action & Abenteuer', genreIds: Object.freeze([12, 28, 10759]) }),
  Object.freeze({ id: 'comedy', title: 'Komödie', genreIds: Object.freeze([35]) }),
  Object.freeze({ id: 'crime-thriller', title: 'Krimi & Thriller', genreIds: Object.freeze([53, 80, 9648]) }),
  Object.freeze({ id: 'science-fiction-fantasy', title: 'Science-Fiction & Fantasy', genreIds: Object.freeze([14, 878, 10765]) }),
  Object.freeze({ id: 'drama-romance', title: 'Drama & Romantik', genreIds: Object.freeze([18, 10749]) }),
  Object.freeze({ id: 'family-animation', title: 'Kinder, Familie & Animation', genreIds: Object.freeze([16, 10751, 10762]) }),
  Object.freeze({ id: 'documentary', title: 'Dokumentation', genreIds: Object.freeze([99]) }),
])

let cachedSummary = null
let summaryLoadedAt = 0
let cachedPromise = null

function mediaType(value) {
  return value === 'series' || value === 'tv' ? 'series' : value === 'movie' ? 'movie' : null
}

function titleKey(value) {
  const type = mediaType(value?.type ?? value?.mediaType)
  const tmdbId = Number(value?.tmdbId)
  return type && Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function finite(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function compareQuality(left, right) {
  const leftVotes = finite(left?.voteCount)
  const rightVotes = finite(right?.voteCount)
  const leftQualified = leftVotes >= 50
  const rightQualified = rightVotes >= 50
  return Number(rightQualified) - Number(leftQualified)
    || finite(right?.voteAverage) - finite(left?.voteAverage)
    || rightVotes - leftVotes
    || finite(right?.popularity) - finite(left?.popularity)
    || String(left?.tvAiring?.startTime || '').localeCompare(String(right?.tvAiring?.startTime || ''))
    || String(left?.title || '').localeCompare(String(right?.title || ''), 'de')
}

function comparePopularity(left, right) {
  return finite(right?.popularity) - finite(left?.popularity)
    || String(left?.tvAiring?.startTime || '').localeCompare(String(right?.tvAiring?.startTime || ''))
    || String(titleKey(left) || '').localeCompare(String(titleKey(right) || ''))
}

function normalRow(id, title, items) {
  return { id, title, variant: 'tv', items: items.slice(0, TV_14_DAY_ROW_LIMIT) }
}

function nextEnabledOption(options, acceptProvider, now) {
  return (Array.isArray(options) ? options : [])
    .map((option) => {
      const providerIds = (Array.isArray(option?.providerIds) ? option.providerIds : [option?.providerId].filter(Boolean))
        .filter((id) => acceptProvider(id, option))
      if (!providerIds.length) return null
      return {
        ...option,
        providerIds,
        providerStationIds: selectProviderMap(option?.providerStationIds, providerIds),
        providerProgramIds: selectProviderMap(option?.providerProgramIds, providerIds),
        playbackRoutes: (Array.isArray(option?.playbackRoutes) ? option.playbackRoutes : [])
          .filter((route) => providerIds.includes(route?.providerId)),
      }
    })
    .filter(Boolean)
    .filter((option) => Date.parse(option?.stopTime) > now)
    .sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || '')))[0] || null
}

function itemFromSummary(entry, airing, titleByKey, artworkOptions, now) {
  if (!airing) return null
  const type = mediaType(entry?.type)
  const tmdbId = Number(entry?.tmdbId)
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0) return null
  const key = `${type}:${tmdbId}`
  const base = titleByKey.get(key) || {
    id: `tv-14-days-${type}-${tmdbId}`,
    source: 'tmdb',
    tmdbId,
    type,
    mediaType: type === 'series' ? 'tv' : 'movie',
    title: entry?.title || `TMDB #${tmdbId}`,
    originalTitle: entry?.originalTitle || entry?.title || '',
    year: entry?.year || null,
    posterUrl: entry?.posterUrl || null,
    posterPath: entry?.posterPath || null,
    neutralPosterUrl: entry?.posterUrl || null,
    genres: (Array.isArray(entry?.genreIds) ? entry.genreIds : []).map((id) => ({ id })),
    genreNames: Array.isArray(entry?.genreNames) ? entry.genreNames : [],
    genre: Array.isArray(entry?.genreNames) && entry.genreNames.length ? entry.genreNames.join(' · ') : 'TV-Programm',
    voteAverage: entry?.voteAverage ?? null,
    voteCount: entry?.voteCount ?? null,
    popularity: entry?.popularity ?? null,
    metadataComplete: false,
  }
  const liveProviderIds = Array.isArray(airing?.providerIds)
    ? [...new Set(airing.providerIds)]
    : [airing?.providerId].filter(Boolean)
  const normalizedAiring = {
    ...airing,
    tmdbId,
    type,
    title: entry?.title || base.title,
    stationId: airing.canonicalStationId || airing.stationId,
    providerIds: liveProviderIds,
  }
  const item = {
    ...base,
    tmdbProviderIds: [...new Set([
      ...(Array.isArray(base.tmdbProviderIds) ? base.tmdbProviderIds : []),
      ...(Array.isArray(entry?.tmdbProviderIds) ? entry.tmdbProviderIds : []),
    ])],
    tmdbProviderOffers: mergeProviderOffers(
      Array.isArray(base?.tmdbProviderOffers) ? base.tmdbProviderOffers : base?.providerOffers,
      entry?.tmdbProviderOffers,
    ),
    id: `tv-14-days-${key}-${liveProviderIds.join('-') || 'provider'}-${airing.stationId || 'station'}`,
    providerIds: [
      ...(Array.isArray(entry?.tmdbProviderIds) ? entry.tmdbProviderIds : []),
      ...(Array.isArray(base.providerIds)
        ? base.providerIds.filter((id) => id !== 'waipu' && id !== 'joyn')
        : []),
      ...liveProviderIds,
    ],
    tvAiring: normalizedAiring,
    tvAiringOnAir: Date.parse(normalizedAiring.startTime) <= now && Date.parse(normalizedAiring.stopTime) > now,
    tvAiringSoon: Date.parse(normalizedAiring.startTime) > now && Date.parse(normalizedAiring.startTime) - now <= 60 * 60 * 1000,
    tvLive: {
      airings: [normalizedAiring],
      nextAiring: normalizedAiring,
      airingCount: Number(entry?.airingCount) || 1,
      providerIds: liveProviderIds,
    },
  }
  if (liveProviderIds.includes('waipu')) {
    item.waipuLive = { airings: [normalizedAiring], nextAiring: normalizedAiring, airingCount: Number(entry?.airingCount) || 1 }
  }
  if (liveProviderIds.includes('joyn')) {
    item.joynLive = { airings: [normalizedAiring], nextAiring: normalizedAiring, airingCount: Number(entry?.airingCount) || 1 }
  }
  return resolvePresentationArtwork(item, artworkOptions)
}

function genreIds(item) {
  return new Set([
    ...(Array.isArray(item?.genres) ? item.genres.map((genre) => Number(genre?.id ?? genre)) : []),
    ...(Array.isArray(item?.genreIds) ? item.genreIds.map(Number) : []),
  ].filter(Number.isFinite))
}

function matchesCategory(item, category) {
  const ids = genreIds(item)
  return category.genreIds.some((id) => ids.has(id))
}

export function normalizeTv14DaySummary(raw) {
  if (raw?.schemaVersion !== TV_14_DAY_SUMMARY_VERSION
      || raw?.kind !== 'moviehub-tv-14-day-summary'
      || !Array.isArray(raw?.entries)) return null
  return {
    generatedAt: raw.generatedAt || null,
    sourceCount: Number(raw.sourceCount) || raw.entries.length,
    count: raw.entries.length,
    entries: raw.entries.filter((entry) => titleKey(entry)),
  }
}

export async function loadTv14DaySummary({
  fetchImpl = fetch,
  force = false,
  signal = null,
} = {}) {
  const usesDefaultFetch = fetchImpl === fetch
  const sharePendingRequest = usesDefaultFetch && !signal
  if (!force && usesDefaultFetch && cachedSummary && Date.now() - summaryLoadedAt < 5 * 60 * 1000) return cachedSummary
  if (!force && sharePendingRequest && cachedPromise) return cachedPromise

  throwIfAborted(signal)
  const request = fetchJsonWithTimeout(TV_14_DAY_SUMMARY_URL, { fetchImpl, signal })
    .then((payload) => {
      const normalized = normalizeTv14DaySummary(payload)
      if (!normalized) throw new Error('14-Tage-TV-Summary hat ein ungültiges Format.')
      throwIfAborted(signal)
      if (usesDefaultFetch) { cachedSummary = normalized; summaryLoadedAt = Date.now() }
      return normalized
    })
    .finally(() => {
      if (sharePendingRequest) cachedPromise = null
    })

  if (sharePendingRequest) cachedPromise = request
  return request
}

export function clearTv14DaySummaryCache() {
  cachedSummary = null
  cachedPromise = null
}

export function buildTv14DayRows({
  enabledProviderIds = null,
  entries = [],
  titles = [],
  activeWaipuStationIds = [],
  activeJoynStationIds = [],
  artworkOptions = {},
  now = Date.now(),
  preparedItems = null,
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const acceptProvider = createLiveProviderFilter({ enabledProviderIds, activeWaipuStationIds, activeJoynStationIds })
  const titleByKey = new Map((Array.isArray(titles) ? titles : [])
    .map((title) => [titleKey(title), title])
    .filter(([key]) => key))

  const normalItems = preparedItems ? preparedItems.map((pair) => pair.normal).filter(Boolean) : []
  const primeItems = preparedItems ? preparedItems.map((pair) => pair.prime).filter(Boolean) : []
  for (const entry of preparedItems ? [] : (Array.isArray(entries) ? entries : [])) {
    const normalAiring = nextEnabledOption(entry?.airingOptions, acceptProvider, timestamp)
    const primeAiring = nextEnabledOption(entry?.primeTimeOptions, acceptProvider, timestamp)
    const normal = itemFromSummary(entry, normalAiring, titleByKey, artworkOptions, timestamp)
    const prime = itemFromSummary(entry, primeAiring, titleByKey, artworkOptions, timestamp)
    if (normal) {
      normal.genreIds = Array.isArray(entry?.genreIds) ? entry.genreIds : []
      normalItems.push(normal)
    }
    if (prime) {
      prime.genreIds = Array.isArray(entry?.genreIds) ? entry.genreIds : []
      primeItems.push(prime)
    }
  }

  normalItems.sort(compareQuality)
  primeItems.sort(compareQuality)
  const rows = [
    normalRow('tv-14-days-movies', 'Filme in den nächsten 14 Tagen', normalItems.filter((item) => item.type === 'movie')),
    normalRow('tv-14-days-series', 'Serien in den nächsten 14 Tagen', normalItems.filter((item) => item.type === 'series')),
    normalRow('tv-14-days-prime-time', 'Prime-Time-Highlights', primeItems),
    ...TV_GENRE_CATEGORIES.map((category) => normalRow(
      `tv-14-days-category-${category.id}`,
      category.title,
      normalItems.filter((item) => matchesCategory(item, category)),
    )),
  ].filter((row) => row.items.length)

  const topTen = [...normalItems].sort(comparePopularity).slice(0, 10)
  const index = Math.min(3, rows.length)
  return [
    ...rows.slice(0, index),
    ...(topTen.length ? [{ id: 'top-ten-tv', title: 'TV Top 10', variant: 'top-ten', items: topTen }] : []),
    ...rows.slice(index),
  ]
}

export function createTv14DayRowsBuilder() {
  let cache = new Map()
  let previous = []
  let configuration = null
  return async (input, { signal } = {}) => {
    const { entries = [], titles = [], artworkOptions, now, enabledProviderIds, activeWaipuStationIds = [], activeJoynStationIds = [] } = input
    const selectionKey = JSON.stringify([enabledProviderIds, activeWaipuStationIds, activeJoynStationIds])
    if (!configuration || configuration.selectionKey !== selectionKey || configuration.titles !== titles || configuration.artworkOptions !== artworkOptions) {
      cache = new Map()
      configuration = { selectionKey, titles, artworkOptions }
    }
    const accept = createLiveProviderFilter(input)
    const titleByKey = new Map(titles.map((title) => [titleKey(title), title]))
    const nextCache = new Map()
    const preparedItems = await mapCooperatively(entries, (entry) => {
      let pair = cache.get(entry)
      if (!pair || now < pair.at || now >= pair.until) {
        const normalAiring = nextEnabledOption(entry.airingOptions, accept, now)
        const primeAiring = nextEnabledOption(entry.primeTimeOptions, accept, now)
        const normal = itemFromSummary(entry, normalAiring, titleByKey, artworkOptions, now)
        const prime = itemFromSummary(entry, primeAiring, titleByKey, artworkOptions, now)
        if (normal) normal.genreIds = entry.genreIds || []
        if (prime) prime.genreIds = entry.genreIds || []
        pair = { normal, prime, at: now, until: nextTvAiringTransition([...(entry.airingOptions || []), ...(entry.primeTimeOptions || [])], now, 60 * 60 * 1000) ?? Infinity }
      }
      nextCache.set(entry, pair)
      return pair
    }, { signal })
    const rows = reuseRows(previous, buildTv14DayRows({ ...input, preparedItems }))
    cache = nextCache
    previous = rows
    return rows
  }
}

export function nextTv14DayTransition(entries, now) {
  let next = Infinity
  for (const entry of entries) {
    next = Math.min(next, nextTvAiringTransition([...(entry.airingOptions || []), ...(entry.primeTimeOptions || [])], now, 60 * 60 * 1000) ?? Infinity)
  }
  return next
}
