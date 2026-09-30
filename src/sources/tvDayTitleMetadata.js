export const TV_DAY_TITLE_METADATA_VERSION = 1

function typeOf(value) {
  return value?.type === 'series' || value?.mediaType === 'tv' ? 'series'
    : value?.type === 'movie' || value?.mediaType === 'movie' ? 'movie'
      : null
}

export function tvTitleKey(value) {
  const type = typeOf(value)
  const tmdbId = Number(value?.tmdbId)
  return type && Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function compactGenreList(value) {
  return (Array.isArray(value) ? value : []).map((genre) => {
    if (genre && typeof genre === 'object') {
      const id = Number(genre.id)
      const name = String(genre.name || '').trim()
      return {
        ...(Number.isFinite(id) ? { id } : {}),
        ...(name ? { name } : {}),
      }
    }
    const id = Number(genre)
    return Number.isFinite(id) ? { id } : null
  }).filter(Boolean)
}

export function compactTvTitleMetadata(value) {
  const key = tvTitleKey(value)
  if (!key) return null
  const type = typeOf(value)
  const tmdbId = Number(value.tmdbId)
  return {
    key,
    tmdbId,
    type,
    title: String(value?.title || '').trim(),
    originalTitle: String(value?.originalTitle || '').trim() || null,
    year: Number(value?.year) || null,
    posterUrl: String(value?.posterUrl || '').trim() || null,
    posterPath: String(value?.posterPath || '').trim() || null,
    neutralPosterUrl: String(value?.neutralPosterUrl || '').trim() || null,
    neutralPosterPath: String(value?.neutralPosterPath || '').trim() || null,
    backdropUrl: String(value?.backdropUrl || '').trim() || null,
    backdropPath: String(value?.backdropPath || '').trim() || null,
    artwork: value?.artwork && typeof value.artwork === 'object' ? value.artwork : null,
    genres: compactGenreList(value?.genres),
    genreNames: Array.isArray(value?.genreNames) ? value.genreNames.map(String).filter(Boolean) : [],
    voteAverage: Number.isFinite(Number(value?.voteAverage)) ? Number(value.voteAverage) : null,
    voteCount: Number.isFinite(Number(value?.voteCount)) ? Number(value.voteCount) : null,
    popularity: Number.isFinite(Number(value?.popularity)) ? Number(value.popularity) : null,
    ageRating: value?.ageRating ?? null,
    metadataVersion: Number(value?.metadataVersion) || 0,
    metadataComplete: value?.metadataComplete === true,
  }
}

export function attachTvDayTitleMetadata(days = {}, titleEntries = []) {
  const byKey = new Map((Array.isArray(titleEntries) ? titleEntries : [])
    .map(compactTvTitleMetadata)
    .filter(Boolean)
    .map((entry) => [entry.key, entry]))
  return Object.fromEntries(Object.entries(days || {}).map(([dayKey, day]) => {
    const keys = new Set((Array.isArray(day?.airings) ? day.airings : [])
      .map(tvTitleKey)
      .filter(Boolean))
    const titles = [...keys].map((key) => byKey.get(key)).filter(Boolean)
      .sort((a, b) => a.key.localeCompare(b.key))
    return [dayKey, {
      ...day,
      titleMetadataVersion: TV_DAY_TITLE_METADATA_VERSION,
      titleCount: titles.length,
      titles,
    }]
  }))
}

export function normalizeTvDayTitles(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map(compactTvTitleMetadata)
    .filter(Boolean)
}
