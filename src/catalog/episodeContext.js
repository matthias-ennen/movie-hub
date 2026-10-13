import { navigationEpisode, sameEpisode } from './episodeResolution.js'

function integer(value, minimum) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= minimum ? number : null
}

// EPG adapters expose both the legacy flat fields and the neutral episode object.
export function episodeReference(airing) {
  if (!airing) return null
  const raw = airing.episode || airing
  const conflict = raw.conflict === true
  const seasonNumber = conflict ? null : integer(raw.seasonNumber, 0) ?? integer(airing.seasonNumber, 0)
  const episodeNumber = conflict ? null : integer(raw.episodeNumber, 1) ?? integer(airing.episodeNumber, 1)
  const title = String(airing.episode ? raw.title || airing.episodeTitle || '' : raw.episodeTitle || '').trim()
  if (seasonNumber === null && episodeNumber === null && !title && !conflict && !raw.resolution) return null
  const catalog = raw.catalog && integer(raw.catalog.tmdbId, 1)
    && integer(raw.catalog.seasonNumber, 0) != null && integer(raw.catalog.episodeNumber, 1)
    ? { tmdbId: Number(raw.catalog.tmdbId), seasonNumber: Number(raw.catalog.seasonNumber),
      episodeNumber: Number(raw.catalog.episodeNumber), title: String(raw.catalog.title || '') } : null
  return { seasonNumber, episodeNumber, title, ...(conflict ? { conflict: true } : {}),
    ...(raw.resolution ? { resolution: raw.resolution } : {}),
    ...(raw.catalogConflict ? { catalogConflict: true } : {}), ...(catalog && !raw.catalogConflict ? { catalog } : {}) }
}

// Call only after broadcast identity has been verified. Preserve conflicts so a
// later provider cannot silently turn an ambiguous reference into a selection.
export function mergeEpisodeReferences(...references) {
  const values = references.filter(Boolean)
  if (!values.length) return null
  const seasons = [...new Set(values.map((value) => value.seasonNumber).filter((value) => value != null))]
  const episodes = [...new Set(values.map((value) => value.episodeNumber).filter((value) => value != null))]
  const conflict = values.some((value) => value.conflict) || seasons.length > 1 || episodes.length > 1
  const title = [...new Set(values.map((value) => value.title).filter(Boolean))].sort()[0] || ''
  const catalogs = [...new Map(values.filter(v => v.catalog).map(v => [v.catalog.tmdbId, v.catalog])).values()]
  const catalogConflict = catalogs.length > 1 || values.some(v => v.catalogConflict)
  const resolution = catalogConflict ? 'conflict' : catalogs.length === 1 ? 'matched'
    : values.map(v => v.resolution).filter(Boolean).sort()[0]
  return { seasonNumber: conflict ? null : seasons[0] ?? null,
    episodeNumber: conflict ? null : episodes[0] ?? null, title,
    ...(conflict ? { conflict: true } : {}), ...(resolution ? { resolution } : {}),
    ...(catalogConflict ? { catalogConflict: true } : {}),
    ...(catalogs.length === 1 && !catalogConflict ? { catalog: catalogs[0] } : {}) }
}

export function openingEpisode(item) {
  if (item?.type !== 'series' && item?.mediaType !== 'tv') return null
  if (Object.prototype.hasOwnProperty.call(item, 'detailEpisode')) return item.detailEpisode
  return navigationEpisode(episodeReference(item.tvAiring))
}

export function episodeNumberLabel(episode) {
  return [episode?.seasonNumber != null ? `Staffel ${episode.seasonNumber}` : '',
    episode?.episodeNumber != null ? `Folge ${episode.episodeNumber}` : ''].filter(Boolean).join(' · ')
}

export function matchingEpisode(episodes, reference) {
  if (reference?.resolution && reference.resolution !== 'matched') return null
  if (reference?.tmdbId) return episodes.find(e => e.tmdbId === reference.tmdbId) || null
  if (reference?.seasonNumber == null || reference?.episodeNumber == null) return null
  return episodes.find((episode) => sameEpisode(episode, reference)) || null
}
