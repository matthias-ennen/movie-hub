import { episodeReference } from '../src/catalog/episodeContext.js'
import { resolveCatalogEpisode } from '../src/catalog/episodeResolution.js'

export function selectEpisodeAliasRefreshCandidates(titles, entries, { now = Date.now(), limit = 100, maxAgeDays = 30 } = {}) {
  const timestamp = Number(now)
  const candidates = new Map()
  for (const title of titles) {
    if (title.type !== 'series') continue
    for (const airing of title.airings?.length ? title.airings : [title.nextAiring].filter(Boolean)) {
      const reference = episodeReference(airing)
      if (reference?.conflict || !reference?.seasonNumber || !reference?.episodeNumber || !reference?.title) continue
      const key = `${Number(title.tmdbId)}:${reference.seasonNumber}`
      const entry = entries.get(key)
      if (!entry?.episodes.length || timestamp - Date.parse(entry.titleAliasesGeneratedAt) < maxAgeDays * 86_400_000) continue
      if (!entry.episodes.some(e => e.episodeNumber === reference.episodeNumber)) continue
      if (resolveCatalogEpisode(reference, entry.episodes).status === 'matched') continue
      const start = Date.parse(airing.startTime), stop = Date.parse(airing.stopTime)
      if (!Number.isFinite(start) || !Number.isFinite(stop)) continue
      const expired = stop <= timestamp
      const priority = expired ? timestamp + 366 * 86_400_000 + timestamp - stop : Math.max(timestamp, start)
      if (!candidates.has(key) || priority < candidates.get(key).priority) candidates.set(key, { entry, priority })
    }
  }
  return [...candidates.values()].sort((a, b) => a.priority - b.priority
    || a.entry.seriesTmdbId - b.entry.seriesTmdbId || a.entry.seasonNumber - b.entry.seasonNumber)
    .slice(0, Math.max(0, Math.floor(limit))).map(candidate => candidate.entry)
}

// Titles are aliases only when TMDB identity and numbering agree in both responses.
export function mergeVerifiedEpisodeAliases(primary, translated, { checkedAt } = {}) {
  const sameSeason = primary.seriesTmdbId === translated?.seriesTmdbId && primary.seasonNumber === translated?.seasonNumber
  const byId = new Map((sameSeason ? translated.episodes : []).filter(e => e.tmdbId).map(e => [e.tmdbId, e]))
  return { ...primary,
    ...(sameSeason && checkedAt ? { titleAliasesGeneratedAt: checkedAt } : {}),
    episodes: primary.episodes.map(episode => {
      const alias = byId.get(episode.tmdbId)
      if (!alias || alias.seasonNumber !== episode.seasonNumber || alias.episodeNumber !== episode.episodeNumber) return episode
      const titleAliases = [...new Set([...(episode.titleAliases || []), alias.title, ...(alias.titleAliases || [])])]
        .filter(title => title && title !== episode.title)
      return titleAliases.length ? { ...episode, titleAliases } : episode
    }),
  }
}

export function buildAvailableSeasons(entries) {
  const available = {}
  for (const entry of entries) {
    if (!entry.episodes?.length || entry.seasonNumber <= 0) continue
    const id = Number(entry.seriesTmdbId)
    ;(available[id] ||= []).push([entry.seasonNumber, entry.episodes.length])
  }
  for (const seasons of Object.values(available)) seasons.sort((a, b) => a[0] - b[0])
  return available
}
