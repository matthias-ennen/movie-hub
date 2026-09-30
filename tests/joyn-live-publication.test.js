import { describe, expect, it } from 'vitest'
import { buildJoynLivePublication } from '../scripts/joyn-live-publication.mjs'

describe('Joyn live publication', () => {
  it('groups early-morning Joyn airings into the previous 06:00-to-06:00 TV day', () => {
    const publication = buildJoynLivePublication({
      generatedAt: '2026-09-30T00:30:00.000Z',
      rawStreams: [{ id: 'tele5-de', title: 'TELE 5' }],
      stationMapping: {
        entries: [{
          joynId: 'tele5-de',
          status: 'matched',
          canonicalId: 'tele5',
          canonicalName: 'TELE 5',
          method: 'normalized-name',
        }],
      },
      envelope: {
        sourceGenerationId: 'joyn:test-0600',
        records: [
          {
            kind: 'broadcast',
            eventId: 'late-night',
            titleRef: { mediaType: 'movie', tmdbId: 11 },
            channelId: 'tele5',
            channelName: 'TELE 5',
            startAt: '2026-09-30T00:30:00.000Z',
            endAt: '2026-09-30T02:00:00.000Z',
            playbackRoutes: [],
            sourceRefs: [],
            extensions: { joyn: { channelId: 'tele5-de', programId: 'p-night', rawTitle: 'Nachtfilm' } },
          },
          {
            kind: 'broadcast',
            eventId: 'morning',
            titleRef: { mediaType: 'movie', tmdbId: 12 },
            channelId: 'tele5',
            channelName: 'TELE 5',
            startAt: '2026-09-30T04:30:00.000Z',
            endAt: '2026-09-30T06:00:00.000Z',
            playbackRoutes: [],
            sourceRefs: [],
            extensions: { joyn: { channelId: 'tele5-de', programId: 'p-morning', rawTitle: 'Morgenfilm' } },
          },
        ],
      },
    })

    expect(publication.index.days).toEqual([
      { key: '2026-09-29', count: 1 },
      { key: '2026-09-30', count: 1 },
    ])
    expect(publication.days['2026-09-29'].airings.map(({ id }) => id)).toEqual(['late-night'])
    expect(publication.days['2026-09-30'].airings.map(({ id }) => id)).toEqual(['morning'])
  })

  it('keeps all Joyn stations while publishing only matched title events', () => {
    const publication = buildJoynLivePublication({
      generatedAt: '2026-09-26T15:00:00.000Z',
      rawStreams: [
        { id: 'prosieben-de', title: 'ProSieben', quality: 'HD' },
        { id: 'joyn-only', title: 'Joyn Only' },
      ],
      stationMapping: {
        entries: [
          { joynId: 'prosieben-de', status: 'matched', canonicalId: 'pro7', canonicalName: 'ProSieben', method: 'normalized-name' },
          { joynId: 'joyn-only', status: 'unmatched' },
        ],
      },
      envelope: {
        sourceGenerationId: 'joyn:test',
        records: [{
          kind: 'broadcast',
          eventId: 'event-1',
          titleRef: { mediaType: 'movie', tmdbId: 11 },
          channelId: 'joyn.joyn-only',
          channelName: 'Joyn Only',
          startAt: '2026-09-26T18:15:00.000Z',
          endAt: '2026-09-26T20:00:00.000Z',
          playbackRoutes: [],
          sourceRefs: [],
          extensions: { joyn: { channelId: 'joyn-only', programId: 'p1', rawTitle: 'Testfilm' } },
        }],
      },
    })

    expect(publication.index.stationCount).toBe(2)
    expect(publication.index.airingCount).toBe(1)
    expect(publication.stations.stations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'prosieben-de', canonicalId: 'pro7' }),
      expect.objectContaining({ id: 'joyn-only', canonicalId: null }),
    ]))
    expect(Object.values(publication.days)[0].airings[0]).toMatchObject({
      stationId: 'joyn-only',
      canonicalStationId: null,
      tmdbId: 11,
    })
  })
})
