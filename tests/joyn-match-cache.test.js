import { describe, expect, it, vi } from 'vitest'
import { JoynMatchCache, JoynLookupCache, joynOriginalCacheKey, sharedJoynTmdbMetadata } from '../scripts/joyn-match-cache.mjs'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
const now = Date.parse('2026-10-07T00:00:00Z')
const candidate = { title: 'Serie', secondaryTitle: 'Folge 1', description: 'Inhalt', startTime: '2026-10-07T01:00:00Z', endTime: '2026-10-07T02:00:00Z' }
describe('persistent Joyn matching evidence', () => {
  it('counts every read outcome exactly once without changing match decisions or persisted entries', () => {
    const cache = new JoynMatchCache({}, now)
    const positive = { decision: { status: 'matched', match: { tmdbId: 1 } } }
    const negative = { decision: { status: 'unmatched', reason: 'no_candidate' } }
    const entryKey = joynOriginalCacheKey(candidate)
    expect(cache.get(candidate)).toBeNull()
    cache.set(candidate, positive)
    expect(cache.getWithProvenance(candidate)?.diagnostic).toBe(positive)
    cache.values[entryKey].checkedAt = new Date(now - 30 * 86400000).toISOString()
    expect(cache.get(candidate)).toBeNull()
    cache.set(candidate, negative, [])
    expect(cache.get(candidate, [])).toBe(negative)
    expect(cache.get(candidate, [{ type: 'series', tmdbId: 1 }])).toBeNull()
    cache.values[entryKey].checkedAt = new Date(now - 7 * 86400000).toISOString()
    expect(cache.get(candidate)).toBeNull()
    cache.values[entryKey].checkedAt = 'invalid'
    expect(cache.get(candidate)).toBeNull()
    cache.values[entryKey] = { checkedAt: new Date(now).toISOString(), diagnostic: { ...negative, joynClassification: { reason: 'http_error' } } }
    expect(cache.get(candidate)).toBeNull()
    expect(cache.hits).toBe(2)
    expect(cache.diagnosticCounters()).toEqual({
      reads: { hitMatched: 1, hitUnmatched: 1, noEntry: 1, invalidTimestamp: 1, expiredMatched: 1, expiredUnmatched: 1, technicalFailure: 1, changedCandidateContext: 1 },
      writes: { stored: 2, ambiguous: 0, budget: 0, technicalFailure: 0, classificationRejected: 0 },
    })
    cache.diagnosticCounters().reads.noEntry = 100
    expect(cache.diagnosticCounters().reads.noEntry).toBe(1)
    expect(Object.keys(cache.values)).toEqual([entryKey])
  })
  it('counts non-persisted ambiguity, budget and technical failures without saving them', () => {
    const cache = new JoynMatchCache({}, now)
    cache.set(candidate, { decision: { status: 'ambiguous' } })
    cache.set(candidate, { decision: { status: 'unmatched', reason: 'tmdb_budget_exhausted' } })
    cache.set(candidate, { decision: { status: 'unmatched' }, joynClassification: { reason: 'http_error' } })
    expect(cache.diagnosticCounters().writes).toMatchObject({ stored: 0, ambiguous: 1, budget: 1, technicalFailure: 1 })
    expect(cache.values).toEqual({})
  })
  it('shares canonical TMDB metadata without copying Waipu availability or private state', () => {
    const [metadata] = sharedJoynTmdbMetadata([{ type: 'movie', tmdbId: 11, title: 'Film', description: 'TMDB', providerIds: ['netflix', 'waipu'], airings: [{ stationId: 'waipu-zdf' }], nextAiring: {}, favorite: true }])
    expect(metadata).toMatchObject({ type: 'movie', tmdbId: 11, description: 'TMDB', providerIds: ['netflix'] })
    expect(metadata).not.toHaveProperty('airings'); expect(metadata).not.toHaveProperty('nextAiring'); expect(metadata).not.toHaveProperty('favorite')
  })
  it('rechecks a negative decision when newly available canonical candidates can resolve it', () => {
    const cache = new JoynMatchCache({}, now)
    cache.set(candidate, { decision: { status: 'unmatched', reason: 'no_candidate' }, localCandidates: [] })
    expect(cache.get(candidate, [])).not.toBeNull()
    expect(cache.get(candidate, [{ type: 'series', tmdbId: 11 }])).toBeNull()
    const locals = [{ type: 'series', tmdbId: 11, description: 'Alt' }]
    cache.set(candidate, { decision: { status: 'unmatched', reason: 'below_threshold' } }, locals)
    expect(cache.get(candidate, locals)).not.toBeNull()
    expect(cache.get(candidate, [{ ...locals[0], description: 'Neue TMDB-Evidenz' }])).toBeNull()
  })

  it('reuses identical evidence at another broadcast time, but rechecks different episodes', () => {
    const cache = new JoynMatchCache({}, now)
    const value = { decision: { status: 'matched', match: { tmdbId: 1 } } }
    cache.set(candidate, value)
    expect(cache.get({ ...candidate, startTime: '2026-10-08T01:00:00Z', endTime: '2026-10-08T02:00:00Z' })).toBe(value)
    expect(cache.get({ ...candidate, secondaryTitle: 'Folge 2' })).toBeNull()
    expect(cache.get({ ...candidate, description: 'Anderer Inhalt' })).toBeNull()
  })
  it('does not save budget failures, ambiguous matches or transient source errors', () => {
    for (const value of [ { decision: { status: 'unmatched', reason: 'tmdb_budget_exhausted' } },
      { decision: { status: 'ambiguous' } }, { decision: { status: 'unmatched' }, joynClassification: { reason: 'http_error' } } ]) {
      const cache = new JoynMatchCache({}, now); cache.set(candidate, value); expect(cache.get(candidate)).toBeNull()
    }
  })
  it('invalidates legacy cached HTTP failures and never caches new ones', () => {
    const lookup = new JoynLookupCache({}, now)
    const cacheKey = lookup.cacheKey('algolia', 'Titel')
    lookup.entries[cacheKey] = { checkedAt: new Date(now).toISOString(), value: { status: 'http_503', hits: [] } }
    expect(lookup.get('algolia', 'Titel')).toBeNull()
    for (const status of ['http_429', 'http_500', 'graphql_error']) {
      lookup.set('algolia', status, { status, hits: [] })
      expect(lookup.get('algolia', status)).toBeNull()
      const matches = new JoynMatchCache({}, now)
      matches.set(candidate, { decision: { status: 'unmatched', reason: 'no_candidate' }, joynClassification: { algolia: { reason: 'algolia_' + status } } })
      expect(matches.get(candidate)).toBeNull()
    }
  })

  it('caches raw lookup responses and expires them after seven days', async () => {
    const cache = new JoynLookupCache({}, now)
    const load = vi.fn(async () => ({ status: 'ready', hits: [1] }))
    await cache.lookup('algolia', 'query', load); await cache.lookup('algolia', 'query', load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(new JoynLookupCache(cache.entries, now + 7 * 86400000).get('algolia', 'query')).toBeNull()
    cache.set('algolia', 'failed', { status: 'error' }); expect(cache.get('algolia', 'failed')).toBeNull()
  })
  it('persistent raw TMDB responses spare network budget while each input is still matched separately', async () => {
    const lookup = new JoynLookupCache({}, now)
    const responseCache = { get: key => lookup.get('tmdb', key), set: (key, value) => lookup.set('tmdb', key, value) }
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ id: 11 }] }) }))
    await new WaipuTmdbSearchClient({ token: 'test', fetchImpl, paceMs: 0, responseCache }).search({ type: 'movie', title: 'Film' })
    const next = new WaipuTmdbSearchClient({ token: 'test', fetchImpl, paceMs: 0, responseCache })
    expect(await next.search({ type: 'movie', title: 'Film' })).toEqual([expect.objectContaining({ id: 11 })])
    expect(next.requestsStarted).toBe(0); expect(fetchImpl).toHaveBeenCalledTimes(1)
    await next.detail({ type: 'movie', tmdbId: 11 })
    const resumed = new WaipuTmdbSearchClient({ token: 'test', fetchImpl, paceMs: 0, responseCache })
    await resumed.detail({ type: 'movie', tmdbId: 11 })
    expect(resumed.requestsStarted).toBe(0); expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
