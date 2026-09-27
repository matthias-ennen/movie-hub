import { describe, expect, it } from 'vitest'
import { chooseJoynTmdbMatch, JoynTmdbSearchClient, matchJoynProgram } from '../scripts/joyn-tmdb-matcher.mjs'
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

  it('uses TMDB first-air year and verified search alias for one unique Joyn series result', async () => {
    let requestedUrl = null
    const fetchImpl = async (url) => {
      requestedUrl = new URL(String(url))
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          results: [{
            id: 80748,
            name: 'FBI',
            original_name: 'FBI',
            first_air_date: '2018-09-25',
          }],
        }),
        text: async () => '',
      }
    }

    const client = new JoynTmdbSearchClient({
      token: 'test-token',
      fetchImpl,
      paceMs: 0,
      maxRequests: 10,
    })
    const candidates = await client.search({
      title: 'FBI: Special Crime Unit',
      type: 'series',
      productionYear: 2018,
    })

    expect(requestedUrl.pathname).toBe('/3/search/tv')
    expect(requestedUrl.searchParams.get('first_air_date_year')).toBe('2018')
    expect(candidates).toEqual([
      expect.objectContaining({
        id: 80748,
        aliases: ['FBI: Special Crime Unit'],
        joynSearchAliasYearVerified: true,
        joynSearchAliasYear: 2018,
      }),
    ])

    const result = await matchJoynProgram(
      {
        title: 'FBI: Special Crime Unit',
        type: 'series',
        productionYear: 2018,
      },
      {
        searchTmdb: async () => candidates,
      },
    )

    expect(result).toMatchObject({
      status: 'matched',
      source: 'local+tmdb-search+search-alias-year',
      match: {
        tmdbId: 80748,
        type: 'series',
        title: 'FBI',
        signals: [{
          kind: 'tmdb_search_alias_year',
          alias: 'FBI: Special Crime Unit',
          productionYear: 2018,
        }],
      },
    })
  })

  it('does not verify a Joyn search alias when TMDB returns multiple year-matched results', async () => {
    const client = new JoynTmdbSearchClient({
      token: 'test-token',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          results: [
            { id: 1, name: 'Example A', first_air_date: '2018-01-01' },
            { id: 2, name: 'Example B', first_air_date: '2018-02-01' },
          ],
        }),
        text: async () => '',
      }),
      paceMs: 0,
      maxRequests: 10,
    })

    const candidates = await client.search({
      title: 'Alternative title',
      type: 'series',
      productionYear: 2018,
    })

    expect(candidates).toHaveLength(2)
    expect(candidates.some((candidate) => candidate.joynSearchAliasYearVerified)).toBe(false)
  })

  it('uses exact production year before softer ambiguity signals', async () => {
    const result = await matchJoynProgram(
      {
        title: 'Same title',
        type: 'movie',
        productionYear: 2016,
      },
      {
        localCandidates: [],
        searchTmdb: async () => [
          { type: 'movie', tmdbId: 1, title: 'Same title', year: 1957 },
          { type: 'movie', tmdbId: 2, title: 'Same title', year: 2016 },
        ],
      },
    )

    expect(result).toMatchObject({
      status: 'matched',
      source: 'local+tmdb-search+year',
      match: {
        tmdbId: 2,
        signals: [expect.objectContaining({
          kind: 'production_year',
          productionYear: 2016,
        })],
      },
    })
  })

  it('uses a clearly matching EPG V2 description to resolve exact-title candidates', async () => {
    const result = await matchJoynProgram(
      {
        title: 'Das singende, klingende Bäumchen',
        type: 'movie',
        description: 'Der König hält die schöne Prinzessin vom wahren Leben fern. Ein Prinz will ihr das singende klingende Bäumchen bringen.',
      },
      {
        localCandidates: [],
        searchTmdb: async () => [
          {
            type: 'movie',
            tmdbId: 14138,
            title: 'Das singende, klingende Bäumchen',
            overview: 'Eine hochmütige Prinzessin begegnet einem Zwerg in einem Zaubergarten und muss ihr Herz ändern.',
          },
          {
            type: 'movie',
            tmdbId: 1067174,
            title: 'Das singende, klingende Bäumchen',
            overview: 'Der König hält seine schöne Prinzessin vom wahren Leben fern. Ein junger Prinz möchte ihr das singende klingende Bäumchen bringen.',
          },
        ],
      },
    )

    expect(result).toMatchObject({
      status: 'matched',
      source: 'local+tmdb-search+description',
      match: {
        tmdbId: 1067174,
        type: 'movie',
        signals: [expect.objectContaining({ kind: 'description' })],
      },
    })
  })

  it('keeps exact-title candidates ambiguous when descriptions are too similar or incomplete', async () => {
    const result = await matchJoynProgram(
      {
        title: 'Same title',
        type: 'movie',
        description: 'Eine Familie erlebt ein großes Abenteuer in einer kleinen Stadt.',
      },
      {
        localCandidates: [],
        searchTmdb: async () => [
          { type: 'movie', tmdbId: 1, title: 'Same title', overview: 'Eine Familie erlebt ein Abenteuer in einer Stadt.' },
          { type: 'movie', tmdbId: 2, title: 'Same title', overview: 'Eine Familie erlebt ein großes Abenteuer in einer kleinen Stadt.' },
        ],
      },
    )

    expect(result).toMatchObject({ status: 'unmatched', reason: 'ambiguous_exact_title' })
  })

  it('uses broadcast duration only to eliminate impossible exact-title movie candidates', async () => {
    const result = await matchJoynProgram(
      {
        title: 'Das singende, klingende Bäumchen',
        type: 'movie',
        broadcastDurationMinutes: 57,
      },
      {
        localCandidates: [],
        searchTmdb: async () => [
          { type: 'movie', tmdbId: 14138, title: 'Das singende, klingende Bäumchen', year: 1957 },
          { type: 'movie', tmdbId: 1067174, title: 'Das singende, klingende Bäumchen', year: 2016 },
        ],
        loadTmdbDetails: async (candidate) => (
          candidate.tmdbId === 14138
            ? { runtimeMinutes: 72 }
            : { runtimeMinutes: 58 }
        ),
      },
    )

    expect(result).toMatchObject({
      status: 'matched',
      source: 'local+tmdb-search+duration',
      match: {
        tmdbId: 1067174,
        type: 'movie',
        signals: [{
          kind: 'broadcast_duration',
          slotMinutes: 57,
          runtimeMinutes: 58,
          excluded: [{ tmdbId: 14138, runtimeMinutes: 72 }],
        }],
      },
    })
  })

  it('keeps an exact-title movie ambiguous when multiple runtimes still fit the broadcast slot', async () => {
    const result = await matchJoynProgram(
      { title: 'Same title', type: 'movie', broadcastDurationMinutes: 57 },
      {
        localCandidates: [],
        searchTmdb: async () => [
          { type: 'movie', tmdbId: 1, title: 'Same title' },
          { type: 'movie', tmdbId: 2, title: 'Same title' },
        ],
        loadTmdbDetails: async (candidate) => ({
          runtimeMinutes: candidate.tmdbId === 1 ? 55 : 60,
        }),
      },
    )

    expect(result).toMatchObject({ status: 'unmatched', reason: 'ambiguous_exact_title' })
  })

  it('keeps an exact-title movie ambiguous when any competing runtime is unknown', async () => {
    const result = await matchJoynProgram(
      { title: 'Same title', type: 'movie', broadcastDurationMinutes: 57 },
      {
        localCandidates: [],
        searchTmdb: async () => [
          { type: 'movie', tmdbId: 1, title: 'Same title' },
          { type: 'movie', tmdbId: 2, title: 'Same title' },
        ],
        loadTmdbDetails: async (candidate) => (
          candidate.tmdbId === 1 ? { runtimeMinutes: 58 } : { runtimeMinutes: null }
        ),
      },
    )

    expect(result).toMatchObject({ status: 'unmatched', reason: 'ambiguous_exact_title' })
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
