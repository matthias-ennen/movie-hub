/** Private, observational fingerprints; no provider reads or matcher decisions. */
import { createHash } from 'node:crypto'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sorted = value => Array.isArray(value) ? [...value].sort() : []
const endpoint = path => path === '/search/movie' ? 'searchMovie'
  : path === '/search/tv' ? 'searchTv' : 'movieDetail'
const counters = () => ({ lookups: 0, cacheHits: 0, actualStarts: 0, successes: 0, failures: 0, budgetSkipped: 0 })

export function createMembershipRequestAudit() {
  const byEndpoint = { searchMovie: counters(), searchTv: counters(), movieDetail: counters() }
  const queries = new Map()
  function track(path, params) {
    const group = endpoint(path)
    // Sort parameter keys solely for fingerprints, never alter the existing cache key.
    const fingerprint = hash([path, Object.entries(params).sort(([a], [b]) => a.localeCompare(b))])
    if (!queries.has(fingerprint)) queries.set(fingerprint, { fingerprint, endpoint: group, ...counters() })
    const row = queries.get(fingerprint)
    const increment = field => { byEndpoint[group][field]++; row[field]++ }
    increment('lookups')
    return { cacheHit: () => increment('cacheHits'), start: () => increment('actualStarts'),
      success: () => increment('successes'), fail: () => increment('failures'), skipped: () => increment('budgetSkipped') }
  }
  return { track, finish: () => ({ byEndpoint, queries: [...queries.values()].sort((a,b) => a.fingerprint.localeCompare(b.fingerprint)) }) }
}

export function membershipInputFingerprints(candidates, episodicVideoIds = new Set()) {
  return candidates.map(c => ({
    video: hash(c.videoId),
    // The current matcher depends on these fields, not the crawl timestamp or list position.
    evidence: hash([c.videoTitle ?? null, c.minutes ?? null, c.screened === true,
      c.status ?? null, c.deRegionSignal ?? null, episodicVideoIds.has(c.videoId)]),
    membership: hash([sorted(c.playlistIds), sorted(c.playlistModes), c.editorialOfferHint ?? null]),
  })).sort((a,b) => a.video.localeCompare(b.video))
}

/** Compare two complete private QA observations; this is not a cache admission rule. */
export function compareMembershipAudits(previous, current) {
  const digest = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x)
  const count = x => Number.isSafeInteger(x) && x >= 0
  const validQueries = a => a === null || (Array.isArray(a) &&
    a.every(r => digest(r?.fingerprint) && count(r?.successes) && count(r?.actualStarts) && r.successes <= r.actualStarts) &&
    new Set(a.map(r => r.fingerprint)).size === a.length)
  const valid = a => a?.schemaVersion === 1 && Array.isArray(a.inputs) && validQueries(a.queries) &&
    a.inputs.every(r => digest(r?.video) && digest(r?.evidence) && digest(r?.membership))
  if (!valid(previous) || !valid(current)) return null
  const old = new Map(previous.inputs.map(r => [r.video, r]))
  const next = new Map(current.inputs.map(r => [r.video, r]))
  if (old.size !== previous.inputs.length || next.size !== current.inputs.length) return null
  const result = { added: 0, removed: 0, unchanged: 0, changedEvidence: 0, changedMembershipOnly: 0,
    repeatedSuccessfulQueryKeys: null, repeatedActualStarts: null }
  for (const [id,row] of next) {
    const before = old.get(id)
    if (!before) result.added++
    else if (before.evidence !== row.evidence) result.changedEvidence++
    else if (before.membership !== row.membership) result.changedMembershipOnly++
    else result.unchanged++
  }
  for (const id of old.keys()) if (!next.has(id)) result.removed++
  if (previous.queries === null || current.queries === null) return result
  result.repeatedSuccessfulQueryKeys = 0
  result.repeatedActualStarts = 0
  const successful = new Set(previous.queries.filter(r => r.successes > 0).map(r => r.fingerprint))
  for (const q of current.queries) if (successful.has(q.fingerprint) && q.actualStarts > 0) {
    result.repeatedSuccessfulQueryKeys++
    result.repeatedActualStarts += q.actualStarts
  }
  return result
}
