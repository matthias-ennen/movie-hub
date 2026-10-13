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
  if (seasonNumber === null && episodeNumber === null && !title && !conflict) return null
  return { seasonNumber, episodeNumber, title, ...(conflict ? { conflict: true } : {}) }
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
  return { seasonNumber: conflict ? null : seasons[0] ?? null,
    episodeNumber: conflict ? null : episodes[0] ?? null, title,
    ...(conflict ? { conflict: true } : {}) }
}

export function openingEpisode(item) {
  if (item?.type !== 'series' && item?.mediaType !== 'tv') return null
  if (Object.prototype.hasOwnProperty.call(item, 'detailEpisode')) return item.detailEpisode
  return episodeReference(item.tvAiring)
}

export function episodeNumberLabel(episode) {
  return [episode?.seasonNumber != null ? `Staffel ${episode.seasonNumber}` : '',
    episode?.episodeNumber != null ? `Folge ${episode.episodeNumber}` : ''].filter(Boolean).join(' · ')
}

export function matchingEpisode(episodes, reference) {
  if (reference?.seasonNumber == null || reference?.episodeNumber == null) return null
  return episodes.find((episode) => episode.seasonNumber === reference.seasonNumber
    && episode.episodeNumber === reference.episodeNumber) || null
}
