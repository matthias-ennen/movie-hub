import { describe, expect, it, vi } from 'vitest'
import { enrichJoynEpisodeReferences } from '../scripts/joyn-episode-enrichment.mjs'
import { JoynLookupCache, JoynMatchCache } from '../scripts/joyn-match-cache.mjs'
import { normalizeJoynLiveChannelsAndEpg } from '../src/sources/joyn/joynEpgNormalizer.js'

const now = Date.parse('2026-10-13T11:00:00Z')
const candidate = { joynProgramId: 'waltons', title: 'Die Waltons', secondaryTitle: 'Das Vollblut',
  startTime: '2026-10-13T10:45:00Z', endTime: '2026-10-13T11:35:00Z' }
const hit = { type: 'EPISODE', id: 'episode-3', titles: { DE: 'Das Vollblut' },
  topLevelTitles: { DE: 'Die Waltons' }, season: { number: 3 }, number: 3 }
const matched = { decision: { status: 'matched', source: 'local', match: { type: 'series', tmdbId: 5021 } } }
const entries = [{ candidate }]
const cache = () => new JoynLookupCache({}, now)
const diagnostics = () => new Map([[candidate.joynProgramId, matched]])

describe('Joyn import episode enrichment independent of title matching', () => {
  it('enriches a locally matched series and a persisted match-cache hit', async () => {
    const matches = new JoynMatchCache({}, now)
    matches.set(candidate, matched)
    for (const diagnostic of [matched, matches.get(candidate)]) {
      const search = vi.fn(async () => ({ status: 'ready', hits: [hit] }))
      const result = await enrichJoynEpisodeReferences(entries, { diagnostics: new Map([['waltons', diagnostic]]), lookupCache: cache(), search })
      expect(result.episodes.get('waltons')).toEqual({ seasonNumber: 3, episodeNumber: 3, title: 'Das Vollblut' })
      expect(search).toHaveBeenCalledWith('Die Waltons Das Vollblut')
      expect(result.metrics.enriched).toBe(1)
    }
  })

  it('reuses positive and negative source responses across repeated broadcasts and runs', async () => {
    for (const hits of [[hit], []]) {
      const lookupCache = cache(), search = vi.fn(async () => ({ status: 'ready', hits }))
      const ds = diagnostics(); ds.set('repeat', matched)
      const inputs = [...entries, { candidate: { ...candidate, joynProgramId: 'repeat' } }]
      await enrichJoynEpisodeReferences(inputs, { diagnostics: ds, lookupCache, search })
      await enrichJoynEpisodeReferences(inputs, { diagnostics: ds, lookupCache: new JoynLookupCache(lookupCache.entries, now + 1000), search })
      expect(search).toHaveBeenCalledTimes(1)
    }
  })

  it('uses cached evidence with no remaining request budget and preserves partial references otherwise', async () => {
    const lookupCache = cache(), search = vi.fn()
    lookupCache.set('algolia-hits-v1', 'Die Waltons', { status: 'ready', hits: [hit] })
    expect((await enrichJoynEpisodeReferences(entries, { diagnostics: diagnostics(), lookupCache, search, maxRequests: 0 })).episodes.get('waltons').episodeNumber).toBe(3)
    const result = await enrichJoynEpisodeReferences([{ candidate: { ...candidate, seasonNumber: 3 } }], {
      diagnostics: diagnostics(), lookupCache: cache(), search, maxRequests: 0,
    })
    expect(result.episodes.get('waltons').seasonNumber).toBe(3)
    expect(result.episodes.get('waltons').episodeNumber).toBeNull()
    expect(result.metrics.deferred).toBe(1)
    expect(search).not.toHaveBeenCalled()
  })

  it('respects the shared request allowance without consuming requests for complete references or movies', async () => {
    const ds = diagnostics(); ds.set('second', matched); ds.set('movie', { decision: { status: 'matched', match: { type: 'movie', tmdbId: 1 } } })
    const search = vi.fn(async () => ({ status: 'ready', hits: [] }))
    const result = await enrichJoynEpisodeReferences([...entries,
      { candidate: { ...candidate, joynProgramId: 'second', secondaryTitle: 'Andere Folge' } },
      { candidate: { ...candidate, joynProgramId: 'movie' } }], { diagnostics: ds, lookupCache: cache(), search, maxRequests: 1 })
    expect(search).toHaveBeenCalledTimes(1)
    expect(result.metrics.deferred).toBe(1)
    const complete = await enrichJoynEpisodeReferences([{ candidate: { ...candidate, seasonNumber: 3, episodeNumber: 3 } }], { diagnostics: diagnostics(), lookupCache: cache(), search })
    expect(complete.metrics.requests).toBe(0)
  })

  it('does not guess another series, an ambiguous episode or contradictory numbers', async () => {
    for (const hits of [[{ ...hit, topLevelTitles: { DE: 'Andere Serie' } }], [hit, { ...hit, id: 'other', number: 4 }]]) {
      const result = await enrichJoynEpisodeReferences(entries, { diagnostics: diagnostics(), lookupCache: cache(), search: async () => ({ status: 'ready', hits }) })
      expect(result.episodes.get('waltons').episodeNumber).toBeNull()
    }
    const result = await enrichJoynEpisodeReferences([{ candidate: { ...candidate, seasonNumber: 4 } }], {
      diagnostics: diagnostics(), lookupCache: cache(), search: async () => ({ status: 'ready', hits: [hit] }),
    })
    expect(result.episodes.get('waltons')).toMatchObject({ conflict: true, seasonNumber: null, episodeNumber: null })
  })

  it('does not cache temporary upstream failures as missing episodes', async () => {
    const lookupCache = cache(), search = vi.fn().mockResolvedValueOnce({ status: 'http_503', hits: [] }).mockResolvedValue({ status: 'ready', hits: [hit] })
    await enrichJoynEpisodeReferences(entries, { diagnostics: diagnostics(), lookupCache, search })
    const result = await enrichJoynEpisodeReferences(entries, { diagnostics: diagnostics(), lookupCache, search })
    expect(search).toHaveBeenCalledTimes(2)
    expect(result.episodes.get('waltons').episodeNumber).toBe(3)
  })

  it('keeps directly supplied episode numbers during EPG normalization', () => {
    const result = normalizeJoynLiveChannelsAndEpg({ liveStreams: [{ id: 'sat1gold-de', title: 'SAT.1 GOLD', epgEvents: [{
      startDate: candidate.startTime, endDate: candidate.endTime,
      program: { id: 'waltons', title: 'Die Waltons', secondaryTitle: 'Das Vollblut', number: 3, season: { number: 3 } },
    }] }] })
    expect(result[0]).toMatchObject({ seasonNumber: 3, episodeNumber: 3 })
  })
})
