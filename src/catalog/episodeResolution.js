// Shared, deterministic identity rules. The import does the catalog lookup;
// clients only consume the compact result and retain the original TV numbering.
export function episodeTitleKey(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('de-DE').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/ (?:teil|part) (\d+)$/, ' $1')
}

function hasTitle(episode, key) {
  return key && [episode.title, ...(episode.titleAliases || [])].some(title => meaningfulTitle(title) === key)
}

function meaningfulTitle(value) {
  const key = episodeTitleKey(value)
  return key && !/^(folge|episode|episod|teil|part) \d+$/.test(key) ? key : null
}

export function resolveCatalogEpisode(reference, episodes, { complete = false } = {}) {
  if (!reference) return { status: 'missing-reference' }
  if (!episodes.length) return { status: 'missing-catalog' }
  const key = meaningfulTitle(reference.title)
  const named = key ? episodes.filter(e => hasTitle(e, key)) : []
  const numbered = !reference.conflict && reference.seasonNumber != null && reference.episodeNumber != null
    ? episodes.find(e => e.seasonNumber === reference.seasonNumber && e.episodeNumber === reference.episodeNumber) : null
  let matched = null
  if (numbered && (!key || !meaningfulTitle(numbered.title) || hasTitle(numbered, key))) matched = numbered
  else if (named.length === 1 && complete) matched = named[0]
  if (matched) return { status: 'matched', catalog: {
    tmdbId: matched.tmdbId, seasonNumber: matched.seasonNumber,
    episodeNumber: matched.episodeNumber, title: meaningfulTitle(matched.title) ? matched.title : reference.title || matched.title,
  } }
  return { status: named.length > 1 ? 'ambiguous' : !complete ? 'missing-catalog'
    : numbered || reference.conflict ? 'conflict' : 'unmatched' }
}

export function navigationEpisode(reference) {
  if (!reference) return null
  return reference.catalog ? { ...reference.catalog, resolution: 'matched' } : reference
}

export function sameEpisode(left, right) {
  if (!left || !right) return false
  const a = navigationEpisode(left), b = navigationEpisode(right)
  if ([a, b].some(e => e.catalogConflict || e.resolution === 'conflict' || e.resolution === 'ambiguous')) return false
  if (a.tmdbId && b.tmdbId) return a.tmdbId === b.tmdbId
  if (a.conflict || b.conflict) return false
  const aTitle = meaningfulTitle(a.title), bTitle = meaningfulTitle(b.title)
  if (a.seasonNumber != null && a.episodeNumber != null && b.seasonNumber != null && b.episodeNumber != null) {
    return a.seasonNumber === b.seasonNumber && a.episodeNumber === b.episodeNumber
      && (!aTitle || !bTitle || aTitle === bTitle)
  }
  return Boolean(aTitle && aTitle === bTitle
    && (a.seasonNumber == null || b.seasonNumber == null || a.seasonNumber === b.seasonNumber)
    && (a.episodeNumber == null || b.episodeNumber == null || a.episodeNumber === b.episodeNumber))
}
