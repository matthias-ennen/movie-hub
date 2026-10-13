import { episodeReference, mergeEpisodeReferences } from '../src/catalog/episodeContext.js'
import { classifyJoynAlgoliaHits } from '../src/sources/joyn/joynAlgoliaClassifier.js'

const complete = (episode) => episode?.seasonNumber != null && episode?.episodeNumber != null

// Separate from title matching: an already recognized/cached series can still
// lack episode identity. Reuse source-response caches, including negative hits.
export async function enrichJoynEpisodeReferences(entries, {
  diagnostics, lookupCache, search, maxRequests = 300,
} = {}) {
  const episodes = new Map()
  const metrics = { series: 0, complete: 0, enriched: 0, requests: 0, deferred: 0, conflicts: 0 }
  const limit = Math.max(0, Number(maxRequests) || 0)
  const resolved = new Map()
  for (const { candidate } of entries) {
    const diagnostic = diagnostics.get(candidate.joynProgramId)
    if (diagnostic?.decision?.status !== 'matched' || diagnostic.decision.match?.type !== 'series') continue
    metrics.series += 1
    const existing = diagnostic.joynClassification?.algolia
    let episode = mergeEpisodeReferences(episodeReference(candidate), episodeReference({
      seasonNumber: existing?.seasonNumber, episodeNumber: existing?.episodeNumber,
      episodeTitle: candidate.secondaryTitle,
    }))
    if (episode) episodes.set(candidate.joynProgramId, episode)
    const initiallyComplete = complete(episode)
    if (!initiallyComplete && !episode?.conflict && candidate.secondaryTitle) {
      const input = { title: candidate.title, secondaryTitle: candidate.secondaryTitle }
      const query = [candidate.title, candidate.secondaryTitle].map((value) => String(value).trim()).join(' ')
      const resolutionKey = JSON.stringify(input)
      // A cached series search can already contain the exact episode. Never
      // perform a second generic search merely to fill optional episode fields.
      let evidence = resolved.get(resolutionKey)
      if (!evidence) {
        const base = lookupCache.get('algolia-hits-v1', candidate.title)
        evidence = classifyJoynAlgoliaHits(input, base?.hits)
        if (!complete(evidence)) {
          let response = lookupCache.get('algolia-hits-v1', query)
          if (!response && metrics.requests < limit && search) {
            metrics.requests += 1
            response = await search(query)
            lookupCache.set('algolia-hits-v1', query, response)
          }
          if (!response || response.status !== 'ready') {
            metrics.deferred += 1
            continue
          }
          evidence = classifyJoynAlgoliaHits(input, response.hits)
        }
        resolved.set(resolutionKey, evidence)
      }
      if (evidence.type === 'series') episode = mergeEpisodeReferences(episode, episodeReference({
        seasonNumber: evidence.seasonNumber, episodeNumber: evidence.episodeNumber,
        episodeTitle: candidate.secondaryTitle,
      }))
    }
    if (episode) episodes.set(candidate.joynProgramId, episode)
    if (episode?.conflict) metrics.conflicts += 1
    if (complete(episode)) { metrics.complete += 1; if (!initiallyComplete) metrics.enriched += 1 }
  }
  return { episodes, metrics }
}
