import { normalizeSeriesSeasons, SERIES_SEASON_DATA_VERSION } from './seriesNavigation.js'

let manifestRequest

// One compact manifest per session; episode lists remain lazy-loaded by shard.
export async function loadSeriesAvailability(seriesTmdbId, { fetchImpl = fetch } = {}) {
  if (!manifestRequest) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    manifestRequest = Promise.resolve().then(() => fetchImpl('/series-details/manifest.json', { cache: 'no-store', signal: controller.signal }))
      .then(async response => {
        if (!response.ok) throw new Error('Series manifest unavailable')
        const manifest = await response.json()
        if (manifest?.kind !== 'series-season-manifest' || manifest.version !== SERIES_SEASON_DATA_VERSION
          || !manifest.availableSeasons || typeof manifest.availableSeasons !== 'object'
          || Array.isArray(manifest.availableSeasons)) throw new Error('Series availability unavailable')
        return manifest.availableSeasons
      }).catch(() => {
        manifestRequest = undefined
        return null
      }).finally(() => clearTimeout(timeout))
  }
  const available = await manifestRequest
  // null distinguishes temporarily unavailable/legacy manifests from an empty catalog.
  return available ? available[Number(seriesTmdbId)] || [] : null
}

export function availableSeriesSeasons(item) {
  const options = { seriesTmdbId: item?.tmdbId, numberOfSeasons: item?.numberOfSeasons }
  const metadata = normalizeSeriesSeasons(item?.seasons, options)
  if (!Array.isArray(item?.availableSeasons)) return metadata.filter(s => s.episodeCount !== 0)
  return normalizeSeriesSeasons(item.availableSeasons
    .filter(row => Array.isArray(row) && Number.isInteger(row[0]) && row[0] > 0 && Number.isInteger(row[1]) && row[1] > 0)
    .map(([seasonNumber, episodeCount]) => ({
      ...metadata.find(s => s.seasonNumber === seasonNumber), seasonNumber, episodeCount,
    })), { seriesTmdbId: item?.tmdbId })
}

export function clearSeriesAvailabilityCache() {
  manifestRequest = undefined
}
