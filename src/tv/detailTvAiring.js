import { areEquivalentTvAirings, mergeTvAirings } from '../sources/mergeTvAirings.js'
import { episodeReference } from '../catalog/episodeContext.js'
import { navigationEpisode, sameEpisode } from '../catalog/episodeResolution.js'

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

/**
 * All future title/episode airings in chronological order. The selected
 * broadcast stays first if it is still present in the *selected* source.
 * A complete title shard replaces the compact two-per-provider preview.
 */
export function listDetailTvAirings(item, {
  now = Date.now(),
  selection = item?.detailSelection,
  fullAirings = null,
} = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const type = mediaType(item?.type ?? item?.mediaType)
  const tmdbId = Number(item?.tmdbId)
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isFinite(timestamp)) return []

  const groups = Array.isArray(fullAirings)
    ? [fullAirings.filter((airing) => Date.parse(airing?.stopTime) > timestamp)
        .map((airing) => ({ ...airing, type, tmdbId }))]
    : Object.values(item?.liveAvailability || {}).map((availability) => (
      (Array.isArray(availability?.airings) && availability.airings.length
        ? availability.airings : [availability?.nextAiring])
        .filter(Boolean)
        .filter((airing) => Date.parse(airing?.stopTime) > timestamp)
        .map((airing) => ({ ...airing, type, tmdbId }))
    ))

  const opened = item?.detailAiring && Date.parse(item.detailAiring.stopTime) > timestamp
    ? { ...item.detailAiring, type, tmdbId } : null
  // Once the complete index is loaded, do not revive a deleted or disabled
  // station's old opening context from a stale compact card.
  const hasOpened = opened && (!Array.isArray(fullAirings)
    || groups[0].some((airing) => areEquivalentTvAirings(airing, opened)))
  // A fresh full shard is authoritative: anchor a prior click for ordering
  // only, never merge its possibly stale playback routes into new evidence.
  const airings = mergeTvAirings(...groups, hasOpened && !Array.isArray(fullAirings) ? [opened] : [])
  const filtered = type === 'series' && selection !== undefined
    ? airings.filter((airing) => {
      const episode = episodeReference(airing)
      if (selection?.episodeNumber != null || selection?.title) return sameEpisode(episode, selection)
      return selection?.seasonNumber != null
        && navigationEpisode(episode)?.seasonNumber === selection.seasonNumber
    }) : airings
  const anchored = hasOpened && filtered.find((airing) => areEquivalentTvAirings(airing, opened))
  return anchored
    ? [anchored, ...filtered.filter((airing) => airing !== anchored)]
    : filtered
}

export function resolveDetailTvAiring(item, options = {}) {
  return listDetailTvAirings(item, options)[0] || null
}

export function formatDetailTvAiring(airing, {
  locale = 'de-DE',
  timeZone = 'Europe/Berlin',
} = {}) {
  const start = new Date(airing?.startTime)
  if (!Number.isFinite(start.getTime())) return null

  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(start)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(start)
  const stationName = String(airing?.stationName || '').trim()

  return [date, `${time} Uhr`, stationName].filter(Boolean).join(' · ')
}
