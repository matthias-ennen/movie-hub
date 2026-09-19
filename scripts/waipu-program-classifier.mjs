const MOVIE_GENRES = new Set(['film', 'filme', 'spielfilm', 'fernsehfilm', 'tvfilm'])
const SERIES_GENRES = new Set(['serie', 'serien'])

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function integer(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

export function normalizeWaipuText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' und ')
    .replace(/\b(?:hd|uhd)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLocaleLowerCase('de')
}

function genreType(value) {
  const normalized = normalizeWaipuText(value).replace(/\s+/g, '')
  if (MOVIE_GENRES.has(normalized)) return 'movie'
  if (SERIES_GENRES.has(normalized)) return 'series'
  return null
}

export function classifyWaipuGridProgram(program) {
  if (!program || typeof program !== 'object') {
    return { type: null, status: 'excluded', reason: 'invalid_grid_program', signals: [] }
  }
  const type = genreType(program.genre)
  if (!type) {
    return { type: null, status: 'excluded', reason: 'unsupported_grid_genre', signals: [] }
  }
  const signals = [`grid_genre:${type}`]
  if (text(program.seriesId)) signals.push('grid_series_id')
  if (text(program.episodeTitle)) signals.push('grid_episode_title')
  return { type, status: 'candidate', reason: null, signals }
}

export function classifyWaipuProgram(program, detail) {
  const grid = classifyWaipuGridProgram(program)
  if (grid.status !== 'candidate') return grid
  if (!detail || typeof detail !== 'object') {
    return { ...grid, status: 'excluded', reason: 'detail_missing' }
  }

  const detailGenreType = genreType(detail.mainGenre)
  const seriesSignals = [
    text(detail.seriesId),
    integer(detail.seasonNumber),
    integer(detail.episodeNumber),
    text(detail.episodeTitle),
  ].filter((value) => value !== null).length
  const signals = [...grid.signals]
  if (detailGenreType) signals.push(`detail_genre:${detailGenreType}`)
  if (seriesSignals) signals.push(`detail_series_signals:${seriesSignals}`)

  if (grid.type === 'movie') {
    if (detailGenreType === 'series' || seriesSignals >= 2) {
      return { type: null, status: 'excluded', reason: 'movie_series_conflict', signals }
    }
    if (detailGenreType !== 'movie') {
      return { type: null, status: 'excluded', reason: 'movie_detail_unconfirmed', signals }
    }
    return { type: 'movie', status: 'accepted', reason: null, confidence: 'high', signals }
  }

  if (detailGenreType !== 'series' && seriesSignals < 2) {
    return { type: null, status: 'excluded', reason: 'series_detail_unconfirmed', signals }
  }
  return {
    type: 'series',
    status: 'accepted',
    reason: null,
    confidence: detailGenreType === 'series' && seriesSignals >= 2 ? 'high' : 'medium',
    signals,
  }
}

export function normalizeWaipuProgram(program, detail, classification) {
  if (classification?.status !== 'accepted' || !classification.type) return null
  const title = text(detail?.title) || text(program?.title)
  if (!title) return null
  const originalTitle = text(detail?.originalTitle)
  const productionYear = integer(detail?.productionYear)
  const productionCountries = Array.isArray(detail?.productionCountries)
    ? [...new Set(detail.productionCountries.map(text).filter(Boolean))]
    : []
  const subGenres = Array.isArray(detail?.subGenres)
    ? [...new Set(detail.subGenres.map(text).filter(Boolean))]
    : []

  return {
    programId: text(detail?.id) || text(program?.id),
    type: classification.type,
    title,
    originalTitle,
    aliases: [...new Set([title, originalTitle].filter(Boolean))],
    productionYear,
    productionCountries,
    mainGenre: text(detail?.mainGenre) || text(program?.genre),
    subGenres,
    seriesId: text(detail?.seriesId) || text(program?.seriesId),
    seasonNumber: integer(detail?.seasonNumber),
    episodeNumber: integer(detail?.episodeNumber),
    episodeTitle: text(detail?.episodeTitle) || text(program?.episodeTitle),
    imageUrls: Array.isArray(detail?.imageUrls)
      ? [...new Set(detail.imageUrls.map(text).filter(Boolean))]
      : [],
    classification,
  }
}
