import { describe, expect, it } from 'vitest'
import { chooseJoynTmdbMatch, matchJoynProgram } from '../scripts/joyn-tmdb-matcher.mjs'
import {
  buildJoynSourceEnvelope,
  mapJoynCandidateToBroadcastEvent,
} from '../src/sources/adapters/joynContractMapper.js'

describe('Joyn TMDB matching', () => {
  it('accepts one unique exact title across movie and series candidates', () => {
    const result = chooseJoynTmdbMatch({ title: 'Arrival' }, [
      { type: 'movie', tmdbId: 329865, title: 'Arrival', year: 2016 },
      { type: 'series', tmdbId: 12, title: 'Arrival Point' },
    ])
    expect(result.status).toBe('matched')
    expect(result.best.candidate).toMatchObject({ type: 'movie', tmdbId: 329865 })
  })

  it('returns the same public match shape for search-assisted results', async () => {
    const result = await matchJoynProgram(
      { title: 'Arrival' },
      {
        localCandidates: [],
        searchTmdb: async () => [
          { type: 'movie', tmdbId: 329865, title: 'Arrival', year: 2016 },
        ],
      },
    )
    expect(result).toMatchObject({
      status: 'matched',
      source: 'local+tmdb-search',
      match: { type: 'movie', tmdbId: 329865, title: 'Arrival' },
    })
  })

  it('does not guess when movie and series have the same exact title', () => {
    const result = chooseJoynTmdbMatch({ title: 'Dark' }, [
      { type: 'movie', tmdbId: 1, title: 'Dark' },
      { type: 'series', tmdbId: 2, title: 'Dark' },
    ])
    expect(result).toMatchObject({ status: 'unmatched', reason: 'ambiguous_exact_title' })
  })
})

describe('Joyn contract mapper', () => {
  it('creates an independent joyn-epg BroadcastEvent and SourceEnvelope', () => {
    const event = mapJoynCandidateToBroadcastEvent({
      joynChannelId: 'joyn-pro7',
      channelTitle: 'ProSieben',
      joynProgramId: 'joyn-program-1',
      title: 'Arrival',
      startTime: '2026-09-26T18:15:00Z',
      endTime: '2026-09-26T20:00:00Z',
    }, {
      tmdbId: 329865,
      type: 'movie',
    }, {
      channelId: 'pro7',
      observedAt: '2026-09-26T12:00:00Z',
    })

    expect(event).toMatchObject({
      channelId: 'pro7',
      titleRef: { mediaType: 'movie', tmdbId: 329865 },
      sourceRefs: [{ sourceId: 'joyn-epg', externalId: 'joyn-program-1' }],
    })
    expect(event.playbackRoutes).toEqual([
      expect.objectContaining({ providerId: 'joyn', mode: 'WEB_LINK' }),
    ])

    const envelope = buildJoynSourceEnvelope([event], {
      generatedAt: '2026-09-26T12:00:00Z',
    })
    expect(envelope).toMatchObject({
      contractVersion: 1,
      sourceId: 'joyn',
      sourceStatus: 'healthy',
    })
    expect(envelope.records).toHaveLength(1)
  })
})


describe('Joyn diagnostic resilience contract', () => {
  it('treats TMDB request budget exhaustion as an unresolved match, not a source failure', () => {
    const decision = {
      matcherVersion: 1,
      status: 'unmatched',
      reason: 'tmdb_budget_exhausted',
      source: 'local',
      match: null,
    }
    expect(decision).toMatchObject({
      status: 'unmatched',
      reason: 'tmdb_budget_exhausted',
      match: null,
    })
  })
})
