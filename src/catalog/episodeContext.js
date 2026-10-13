function integer(value, minimum) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= minimum ? number : null
}

// EPG adapters expose both the legacy flat fields and the neutral episode object.
export function episodeReference(airing) {
  if (!airing) return null
  const raw = airing.episode || airing
  const seasonNumber = integer(raw.seasonNumber, 0)
  const episodeNumber = integer(raw.episodeNumber, 1)
  const title = String(airing.episode ? raw.title || '' : raw.episodeTitle || '').trim()
  if (seasonNumber === null && episodeNumber === null && !title) return null
  return { seasonNumber, episodeNumber, title }
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
