import { describe, expect, it, vi } from 'vitest'
import { JoynMatchCache, JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
const now = Date.parse('2026-10-07T00:00:00Z')
const candidate = { title: 'Serie', secondaryTitle: 'Folge 1', description: 'Inhalt', startTime: '2026-10-07T01:00:00Z', endTime: '2026-10-07T02:00:00Z' }
describe('persistent Joyn matching evidence', () => {
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
