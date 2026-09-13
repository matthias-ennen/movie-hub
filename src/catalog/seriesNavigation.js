export const SERIES_SEASON_DATA_VERSION = 1
export const SERIES_SEASON_BUCKET_COUNT = 256

function buildImageUrl(path, size) {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${String(path).startsWith('/') ? path : `/${path}`}`
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function nonNegativeInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null
}

export function normalizeSeriesSeasons(rawSeasons, { seriesTmdbId, numberOfSeasons } = {}) {
  const tmdbId = positiveInteger(seriesTmdbId)
  const seasons = Array.isArray(rawSeasons) ? rawSeasons : []
  const normalized = seasons
    .map((season) => {
      const seasonNumber = positiveInteger(season?.seasonNumber ?? season?.season_number)
      if (!seasonNumber) return null
      const posterPath = season?.posterPath || season?.poster_path || null
      const rawEpisodeCount = season?.episodeCount ?? season?.episode_count
      return {
        id: tmdbId ? `tmdb-series-${tmdbId}-season-${seasonNumber}` : `season-${seasonNumber}`,
        seriesTmdbId: tmdbId,
        seasonNumber,
        title: String(season?.title || season?.name || `Staffel ${seasonNumber}`).trim() || `Staffel ${seasonNumber}`,
        description: String(season?.description || season?.overview || ''),
        airDate: isoDate(season?.airDate ?? season?.air_date),
        episodeCount: nonNegativeInteger(rawEpisodeCount),
        posterPath,
        posterUrl: season?.posterUrl || buildImageUrl(posterPath, 'w500'),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.seasonNumber - right.seasonNumber)

  if (normalized.length) {
    return [...new Map(normalized.map((season) => [season.seasonNumber, season])).values()]
  }

  const count = positiveInteger(numberOfSeasons)
  if (!count) return []
  return Array.from({ length: count }, (_, index) => {
    const seasonNumber = index + 1
    return {
      id: tmdbId ? `tmdb-series-${tmdbId}-season-${seasonNumber}` : `season-${seasonNumber}`,
      seriesTmdbId: tmdbId,
      seasonNumber,
      title: `Staffel ${seasonNumber}`,
      description: '',
      airDate: null,
      episodeCount: null,
      posterPath: null,
      posterUrl: null,
    }
  })
}

export function normalizeSeasonEpisode(raw, { seriesTmdbId, seriesTitle, seasonNumber } = {}) {
  const resolvedSeasonNumber = positiveInteger(raw?.seasonNumber ?? raw?.season_number ?? seasonNumber)
  const episodeNumber = positiveInteger(raw?.episodeNumber ?? raw?.episode_number)
  if (!resolvedSeasonNumber || !episodeNumber) return null

  const tmdbId = positiveInteger(raw?.tmdbId ?? raw?.id)
  const stillPath = raw?.stillPath || raw?.still_path || null
  const title = String(raw?.title || raw?.name || `Folge ${episodeNumber}`).trim() || `Folge ${episodeNumber}`
  const rawRuntime = raw?.runtimeMinutes ?? raw?.runtime
  const rawVoteAverage = raw?.voteAverage ?? raw?.vote_average

  return {
    id: tmdbId
      ? `tmdb-episode-${tmdbId}`
      : `tmdb-series-${positiveInteger(seriesTmdbId) || 'unknown'}-season-${resolvedSeasonNumber}-episode-${episodeNumber}`,
    tmdbId,
    type: 'episode',
    seriesTmdbId: positiveInteger(seriesTmdbId),
    seriesTitle: String(seriesTitle || '').trim() || null,
    seasonNumber: resolvedSeasonNumber,
    episodeNumber,
    title,
    description: String(raw?.description || raw?.overview || ''),
    airDate: isoDate(raw?.airDate ?? raw?.air_date),
    runtimeMinutes: positiveInteger(rawRuntime),
    voteAverage: Number.isFinite(Number(rawVoteAverage)) ? Number(rawVoteAverage) : null,
    stillPath,
    stillUrl: raw?.stillUrl || buildImageUrl(stillPath, 'w780'),
  }
}

export function normalizeSeriesSeasonDetail(payload, options = {}) {
  const seriesTmdbId = positiveInteger(payload?.seriesTmdbId ?? options.seriesTmdbId)
  const seasonNumber = positiveInteger(payload?.seasonNumber ?? payload?.season_number ?? options.seasonNumber)
  if (!seriesTmdbId || !seasonNumber) throw new Error('Staffeldaten enthalten keine gültige Serien- oder Staffel-ID.')

  const seriesTitle = String(payload?.seriesTitle || options.seriesTitle || '').trim() || null
  const episodes = (Array.isArray(payload?.episodes) ? payload.episodes : [])
    .map((episode) => normalizeSeasonEpisode(episode, { seriesTmdbId, seriesTitle, seasonNumber }))
    .filter(Boolean)
    .sort((left, right) => left.episodeNumber - right.episodeNumber)

  return {
    kind: 'series-season-detail',
    version: SERIES_SEASON_DATA_VERSION,
    generatedAt: payload?.generatedAt || null,
    seriesTmdbId,
    seriesTitle,
    seasonNumber,
    title: String(payload?.title || payload?.name || `Staffel ${seasonNumber}`).trim() || `Staffel ${seasonNumber}`,
    description: String(payload?.description || payload?.overview || ''),
    posterPath: payload?.posterPath || payload?.poster_path || null,
    posterUrl: payload?.posterUrl || buildImageUrl(payload?.posterPath || payload?.poster_path, 'w500'),
    episodes: [...new Map(episodes.map((episode) => [episode.episodeNumber, episode])).values()],
  }
}

export function seriesSeasonBucket(seriesTmdbId) {
  const seriesId = positiveInteger(seriesTmdbId)
  if (!seriesId) throw new Error('Ungültige Serien-ID.')
  return (seriesId % SERIES_SEASON_BUCKET_COUNT).toString(16).padStart(2, '0')
}

export function seriesSeasonDetailPath(seriesTmdbId) {
  return `/series-details/${seriesSeasonBucket(seriesTmdbId)}.json`
}

const seasonShardCache = new Map()

export async function loadSeriesSeasonDetail(series, season, { fetchImpl = fetch } = {}) {
  const seriesTmdbId = positiveInteger(series?.tmdbId ?? season?.seriesTmdbId)
  const seasonNumber = positiveInteger(season?.seasonNumber)
  if (!seriesTmdbId || !seasonNumber) throw new Error('Ungültige Serien- oder Staffel-ID.')
  const bucket = seriesSeasonBucket(seriesTmdbId)

  let request = seasonShardCache.get(bucket)
  if (!request) request = fetchImpl(seriesSeasonDetailPath(seriesTmdbId), { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Staffeldaten konnten nicht geladen werden (${response.status}).`)
      const payload = await response.json()
      if (
        payload?.kind !== 'series-season-shard'
        || Number(payload?.version) !== SERIES_SEASON_DATA_VERSION
        || payload?.bucket !== bucket
        || !Array.isArray(payload?.entries)
      ) throw new Error('Der geladene Staffel-Datenbestand ist ungültig.')
      return payload.entries
    })
    .catch((error) => {
      seasonShardCache.delete(bucket)
      throw error
    })

  seasonShardCache.set(bucket, request)
  const entries = await request
  const payload = entries.find((entry) => (
    Number(entry?.seriesTmdbId) === seriesTmdbId
    && Number(entry?.seasonNumber) === seasonNumber
  ))
  if (!payload) throw new Error('Für diese Staffel liegen noch keine Episodendaten vor.')
  return normalizeSeriesSeasonDetail(payload, {
    seriesTmdbId,
    seriesTitle: series?.title,
    seasonNumber,
  })
}

export function clearSeriesSeasonDetailCache() {
  seasonShardCache.clear()
}
