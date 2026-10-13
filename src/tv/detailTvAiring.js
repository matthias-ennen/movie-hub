import { areEquivalentTvAirings, mergeTvAirings } from '../sources/mergeTvAirings.js'
import { episodeReference } from '../catalog/episodeContext.js'
import { navigationEpisode, sameEpisode } from '../catalog/episodeResolution.js'

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

export function resolveDetailTvAiring(item, { now = Date.now(), selection = item?.detailSelection } = {}) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const type = mediaType(item?.type ?? item?.mediaType)
  const tmdbId = Number(item?.tmdbId)
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isFinite(timestamp)) return null

  const groups = Object.values(item?.liveAvailability || {}).map((availability) => (
    (Array.isArray(availability?.airings) && availability.airings.length
      ? availability.airings
      : [availability?.nextAiring])
      .filter(Boolean)
      .filter((airing) => Date.parse(airing?.stopTime) > timestamp)
      .map((airing) => ({
        ...airing,
        type,
        tmdbId,
      }))
  ))

  const opened = item?.detailAiring && Date.parse(item.detailAiring.stopTime) > timestamp
    ? { ...item.detailAiring, type, tmdbId } : null
  const airings = mergeTvAirings(...groups, opened ? [opened] : [])
  if (type === 'series' && selection !== undefined) {
    return airings.find(airing => {
      const episode = episodeReference(airing)
      if (selection?.episodeNumber != null || selection?.title) return sameEpisode(episode, selection)
      return selection?.seasonNumber != null && navigationEpisode(episode)?.seasonNumber === selection.seasonNumber
    }) || null
  }
  return (opened && airings.find(airing => areEquivalentTvAirings(airing, opened))) || airings[0] || null
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
