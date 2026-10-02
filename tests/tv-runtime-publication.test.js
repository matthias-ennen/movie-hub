import { describe, expect, it } from 'vitest'
import {
  buildTvRuntimeSnapshot,
  TV_RUNTIME_DAY_KIND,
  TV_RUNTIME_HERO_KIND,
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
      // Joyn deliberately comes first because production source discovery is
      // alphabetical. The merge must still retain Waipu's own program id.
      sourceCatalogs: [
        {
          providerId: 'joyn',
          entries: [{
            tmdbId: 16281,
            type: 'movie',
            airings: [{
              stationId: 'kabeleinsclassics',
              canonicalStationId: 'kabeleinsclassics',
              sourceStationId: 'kabeleinsclassics-de-hd',
              stationName: 'Kabel Eins CLASSICS',
              programId: 'j1',
              startTime: '2026-10-01T09:30:00.000Z',
              stopTime: '2026-10-01T11:25:00.000Z',
              playbackRoutes: [],
            }],
          }],
        },
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
              playbackRoutes: [],
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
    expect(entry.airings[0].providerProgramIds).toEqual({
      joyn: 'j1',
      waipu: 'w1',
    })
    expect(entry.airings[0].programId).toBe('j1')
    expect(entry.airings[0].playbackRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: 'joyn',
        mode: 'WEB_LINK',
        scope: 'channel',
        target: 'https://www.joyn.de/play/live-tv?channel_id=kabeleinsclassics-de-hd',
      }),
      expect.objectContaining({
        providerId: 'waipu',
        mode: 'APP_DEEP_LINK',
        scope: 'program',
        target: 'https://app.waipu.tv/epgdetails/kabeleinsclassics/w1',
      }),
    ]))
  })

  it('publishes a small hero pool ranked from the complete runtime horizon', () => {
    const completeChecks = {
      details: 'present',
      artwork: 'present',
      ageRating: 'present',
      credits: 'present',
      keywords: 'present',
      videos: 'present',
      providers: 'present',
      collection: 'absent',
    }
    const title = (tmdbId, titleText, popularity, backdropUrl) => ({
      tmdbId,
      type: 'movie',
      title: titleText,
      description: `Beschreibung ${titleText}`,
      backdropUrl,
      posterUrl: `https://image.test/${tmdbId}.jpg`,
      popularity,
      voteAverage: 7.5,
      metadataVersion: 3,
      metadataChecks: completeChecks,
      metadataComplete: true,
      collectionChecked: true,
      videos: [{ id: `video-${tmdbId}`, site: 'YouTube', key: `key-${tmdbId}`, type: 'Trailer' }],
    })

    const publication = buildTvRuntimeSnapshot({
      now: Date.parse('2026-10-01T08:00:00.000Z'),
      catalog: {
        titles: [
          title(1, 'Jetzt im TV', 1, 'https://image.test/1-backdrop.jpg'),
          title(2, 'Heute später', 100, 'https://image.test/2-backdrop.jpg'),
          title(3, 'Übermorgen', 1000, 'https://image.test/3-backdrop.jpg'),
          { ...title(4, 'Ohne Backdrop', 9999, null), backdropUrl: null, artwork: { heroBackdropPaths: [] } },
        ],
      },
      sourceCatalogs: [{
        providerId: 'waipu',
        entries: [
          {
            tmdbId: 1,
            type: 'movie',
            airings: [{
              stationId: 'zdf',
              stationName: 'ZDF',
              startTime: '2026-10-01T07:30:00.000Z',
              stopTime: '2026-10-01T09:00:00.000Z',
            }],
          },
          {
            tmdbId: 2,
            type: 'movie',
            airings: [{
              stationId: 'rtl',
              stationName: 'RTL',
              startTime: '2026-10-01T15:00:00.000Z',
              stopTime: '2026-10-01T17:00:00.000Z',
            }],
          },
          {
            tmdbId: 3,
            type: 'movie',
            airings: [{
              stationId: 'tele5',
              stationName: 'TELE 5',
              startTime: '2026-10-03T18:15:00.000Z',
              stopTime: '2026-10-03T20:15:00.000Z',
            }],
          },
          {
            tmdbId: 4,
            type: 'movie',
            airings: [{
              stationId: 'sat1',
              stationName: 'SAT.1',
              startTime: '2026-10-01T10:00:00.000Z',
              stopTime: '2026-10-01T12:00:00.000Z',
            }],
          },
        ],
      }],
    })

    expect(publication.hero.kind).toBe(TV_RUNTIME_HERO_KIND)
    expect(publication.hero.entries.map((entry) => entry.tmdbId)).toEqual([1, 2, 3])
    expect(publication.hero.sourceTitleCount).toBe(3)
    expect(publication.hero.entries[0]).toMatchObject({
      title: 'Jetzt im TV',
      description: 'Beschreibung Jetzt im TV',
      backdropUrl: 'https://image.test/1-backdrop.jpg',
      metadataVersion: 3,
      metadataComplete: true,
      collectionChecked: true,
    })
    expect(publication.hero.entries[0].videos).toEqual([
      expect.objectContaining({ site: 'YouTube', key: 'key-1', type: 'Trailer' }),
    ])
    expect(publication.hero.entries[0].airings[0]).toMatchObject({
      stationId: 'zdf',
      providerIds: ['waipu'],
    })

    // Rich hero metadata must not inflate every day shard.
    expect(publication.days[0].entries[0]).not.toHaveProperty('description')
    expect(publication.days[0].entries[0]).not.toHaveProperty('backdropUrl')
    expect(publication.index.heroCount).toBe(3)
  })

  it('keeps station diversity inside the bounded hero airing list', () => {
    const airings = [
      ...Array.from({ length: 13 }, (_, index) => ({
        stationId: 'zdf',
        stationName: 'ZDF',
        startTime: new Date(Date.parse('2026-10-01T09:00:00.000Z') + index * 3_600_000).toISOString(),
        stopTime: new Date(Date.parse('2026-10-01T10:00:00.000Z') + index * 3_600_000).toISOString(),
      })),
      {
        stationId: 'rtl',
        stationName: 'RTL',
        startTime: '2026-10-03T09:00:00.000Z',
        stopTime: '2026-10-03T11:00:00.000Z',
      },
    ]
    const publication = buildTvRuntimeSnapshot({
      now: Date.parse('2026-10-01T08:00:00.000Z'),
      catalog: {
        titles: [{
          tmdbId: 55,
          type: 'movie',
          title: 'Viele Ausstrahlungen',
          backdropUrl: 'https://image.test/backdrop.jpg',
          metadataComplete: true,
          collectionChecked: true,
        }],
      },
      sourceCatalogs: [{
        providerId: 'waipu',
        entries: [{ tmdbId: 55, type: 'movie', airings }],
      }],
    })

    const heroAirings = publication.hero.entries[0].airings
    expect(heroAirings).toHaveLength(12)
    expect(heroAirings.some((airing) => airing.stationId === 'rtl')).toBe(true)
  })

  it('preserves non-empty metadata when a later source contains gaps', () => {
    const publication = buildTvRuntimeSnapshot({
      now: Date.parse('2026-10-01T08:00:00.000Z'),
      catalog: {
        titles: [{
          tmdbId: 44,
          type: 'movie',
          title: 'Canonical Film',
          year: 2024,
          ageRating: 12,
          posterUrl: 'https://image.test/canonical.jpg',
          tmdbProviderIds: ['netflix'],
          genres: [{ id: 18, name: 'Drama' }],
        }],
      },
      sourceCatalogs: [{
        providerId: 'waipu',
        entries: [{
          tmdbId: 44,
          type: 'movie',
          title: 'Canonical Film',
          ageRating: null,
          posterUrl: null,
          airings: [{
            stationId: 'zdf',
            stationName: 'ZDF',
            startTime: '2026-10-01T18:00:00.000Z',
            stopTime: '2026-10-01T20:00:00.000Z',
          }],
        }],
      }],
    })

    const entry = publication.days[0].entries[0]
    expect(entry.ageRating).toBe(12)
    expect(entry.posterUrl).toBe('https://image.test/canonical.jpg')
    expect(entry.tmdbProviderIds).toEqual(['netflix'])
    expect(entry.genreIds).toContain(18)
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
