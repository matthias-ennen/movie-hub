/** Count existing diagnostic decisions; never infer source type from a TMDB match. */
export function summarizeJoynClassificationCoverage(programDiagnostics, cachedProgramIds) {
  const types = ['movie', 'series', 'notNeeded', 'unknown']
  const makeBucket = () => ({ total: 0, matched: 0, unresolved: 0,
    byClassification: Object.fromEntries(types.map(type => [type, { total: 0, matched: 0, unresolved: 0 }])) })
  const result = { all: makeBucket(), cache: makeBucket(), fresh: makeBucket() }
  for (const [id, entry] of programDiagnostics) {
    const classification = entry?.joynClassification
    const type = classification?.type === 'movie' || classification?.type === 'series'
      ? classification.type : classification?.reason === 'not_needed' ? 'notNeeded' : 'unknown'
    const outcome = entry?.decision?.status === 'matched' ? 'matched' : 'unresolved'
    for (const bucket of [result.all, cachedProgramIds.has(id) ? result.cache : result.fresh]) {
      bucket.total += 1
      bucket[outcome] += 1
      bucket.byClassification[type].total += 1
      bucket.byClassification[type][outcome] += 1
    }
  }
  return result
}
