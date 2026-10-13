import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { episodeReference } from '../src/catalog/episodeContext.js'
import { resolveCatalogEpisode } from '../src/catalog/episodeResolution.js'
import { normalizeSeriesSeasons, SERIES_SEASON_BUCKET_COUNT, SERIES_SEASON_DATA_VERSION } from '../src/catalog/seriesNavigation.js'

export async function readEpisodeSeasons(directory) {
  const shards = await Promise.all(Array.from({ length: SERIES_SEASON_BUCKET_COUNT }, async (_, index) => {
    const bucket = index.toString(16).padStart(2, '0')
    try {
      const data = JSON.parse(await readFile(resolve(directory, `${bucket}.json`), 'utf8'))
      if (data.kind !== 'series-season-shard' || data.version !== SERIES_SEASON_DATA_VERSION
        || data.bucket !== bucket || !Array.isArray(data.entries)) throw new Error(`Invalid episode shard ${bucket}`)
      return data.entries
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }))
  return shards.flat()
}

export function enrichTvSourceEpisodes(sources, seasonEntries) {
  const bySeries = new Map()
  for (const season of seasonEntries) {
    const id = Number(season.seriesTmdbId)
    if (!bySeries.has(id)) bySeries.set(id, new Map())
    bySeries.get(id).set(season.seasonNumber, season)
  }
  const cache = new Map()
  return sources.map(source => {
    const counts = { total: 0, matched: 0, missingCatalog: 0, missingReference: 0, ambiguous: 0, conflict: 0, unmatched: 0 }
    const entries = source.entries.map(entry => {
      if (entry.type !== 'series') return entry
      const seasons = bySeries.get(Number(entry.tmdbId)) || new Map()
      const expected = normalizeSeriesSeasons(entry.seasons, { seriesTmdbId: entry.tmdbId, numberOfSeasons: entry.numberOfSeasons })
      const complete = expected.length > 0 && expected.every(s => seasons.has(s.seasonNumber)
        && (s.episodeCount == null || seasons.get(s.seasonNumber).episodes.length >= s.episodeCount))
      const episodes = [...seasons.values()].flatMap(s => s.episodes)
      const airings = (entry.airings?.length ? entry.airings : [entry.nextAiring].filter(Boolean)).map(airing => {
        const reference = episodeReference(airing)
        const key = JSON.stringify([entry.tmdbId, complete, reference])
        if (!cache.has(key)) cache.set(key, resolveCatalogEpisode(reference, episodes, { complete }))
        const result = cache.get(key)
        counts.total += 1
        counts[{ 'missing-catalog': 'missingCatalog', 'missing-reference': 'missingReference' }[result.status] || result.status] += 1
        return { ...airing, episode: { ...reference, resolution: result.status, ...(result.catalog ? { catalog: result.catalog } : {}) } }
      })
      return { ...entry, airings, nextAiring: airings[0] || null }
    })
    return { ...source, entries, episodeResolution: counts }
  })
}
