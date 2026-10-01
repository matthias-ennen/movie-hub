import { describe, expect, it } from 'vitest'
import {
  buildTvRuntimeSnapshot,
  TV_RUNTIME_DAY_KIND,
  TV_RUNTIME_SNAPSHOT_KIND,
} from '../src/tv/tvRuntimePublication.js'

describe('TV runtime publication', () => {
  it('publishes one canonical airing with both providers and playback routes', () => {
    const publication = buildTvRuntimeSnapshot({
      now: Date.parse('2026-10-01T08:00:00.000Z'),
      catalog: {
        titles: [{
          tmdbId: 16281,
          type: 'movie',
          title: 'Creepshow - Die unheimlich verrückte Geisterstunde',
          year: 1982,
          ageRating: 16,
          posterUrl: 'https://image.test/creepshow.jpg',
          genres: [{ id: 27, name: 'Horror' }],
          tmdbProviderIds: ['pluto'],
          voteAverage: 6.9,
          voteCount: 1200,
        }],
      },
      sourceCatalogs: [
        {
          providerId: 'waipu',
          entries: [{
            tmdbId: 16281,
            type: 'movie',
            airings: [{
              stationId: 'kabeleinsclassics',
              stationName: 'Kabel Eins CLASSICS',
              programId: 'w1',
              startTime: '2026-10-01T09:30:00.000Z',
              stopTime: '2026-10-01T11:25:00.000Z',
              playbackRoutes: [{
                providerId: 'waipu',
                mode: 'APP_DEEP_LINK',
                target: 'https://app.waipu.tv/epgdetails/kabeleinsclassics/w1',
              }],
            }],
          }],
        },
        {
          providerId: 'joyn',
          entries: [{
            tmdbId: 16281,
            type: 'movie',
            airings: [{
              stationId: 'kabeleinsclassics-de-hd',
              canonicalStationId: 'kabeleinsclassics',
              sourceStationId: 'kabeleinsclassics-de-hd',
              stationName: 'Kabel Eins CLASSICS',
              programId: 'j1',
              startTime: '2026-10-01T09:30:00.000Z',
              stopTime: '2026-10-01T11:25:00.000Z',
              playbackRoutes: [{
                providerId: 'joyn',
                mode: 'WEB_LINK',
                target: 'https://www.joyn.de/play/live-tv?channel_id=1002',
              }],
            }],
          }],
        },
      ],
    })

    expect(publication.index.kind).toBe(TV_RUNTIME_SNAPSHOT_KIND)
    expect(publication.index.providers).toEqual(['joyn', 'waipu'])
    expect(publication.days).toHaveLength(1)
    expect(publication.days[0].kind).toBe(TV_RUNTIME_DAY_KIND)
    expect(publication.days[0].entries).toHaveLength(1)

    const entry = publication.days[0].entries[0]
    expect(entry).toMatchObject({
      tmdbId: 16281,
      title: 'Creepshow - Die unheimlich verrückte Geisterstunde',
      year: 1982,
      ageRating: 16,
      tmdbProviderIds: ['pluto'],
    })
    expect(entry.airings).toHaveLength(1)
    expect(entry.airings[0].providerIds).toEqual(['joyn', 'waipu'])
    expect(entry.airings[0].providerStationIds).toEqual({
      joyn: 'kabeleinsclassics-de-hd',
      waipu: 'kabeleinsclassics',
    })
    expect(entry.airings[0].playbackRoutes.map(({ providerId }) => providerId).sort())
      .toEqual(['joyn', 'waipu'])
  })

  it('groups early-morning airings into the previous TV day', () => {
    const publication = buildTvRuntimeSnapshot({
      now: Date.parse('2026-10-01T20:00:00.000Z'),
      sourceCatalogs: [{
        providerId: 'waipu',
        entries: [{
          tmdbId: 11,
          type: 'movie',
          title: 'Night Film',
          airings: [{
            stationId: 'zdf',
            stationName: 'ZDF',
            startTime: '2026-10-02T02:00:00.000Z',
            stopTime: '2026-10-02T04:00:00.000Z',
          }],
        }],
      }],
    })

    expect(publication.days.map(({ key }) => key)).toEqual(['2026-10-01'])
  })

  it('drops expired airings before publication', () => {
    const publication = buildTvRuntimeSnapshot({
      now: Date.parse('2026-10-01T12:00:00.000Z'),
      sourceCatalogs: [{
        providerId: 'waipu',
        entries: [{
          tmdbId: 11,
          type: 'movie',
          airings: [{
            stationId: 'zdf',
            stationName: 'ZDF',
            startTime: '2026-10-01T08:00:00.000Z',
            stopTime: '2026-10-01T10:00:00.000Z',
          }],
        }],
      }],
    })

    expect(publication.index.dayCount).toBe(0)
    expect(publication.index.airingCount).toBe(0)
  })
})
