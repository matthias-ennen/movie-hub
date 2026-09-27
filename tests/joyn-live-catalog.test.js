import { describe, expect, it } from 'vitest'
import {
  getJoynLiveDestination,
  mergeJoynLiveAvailability,
  normalizeJoynLiveTitles,
} from '../src/joyn/joynLiveCatalog.js'

describe('Joyn live title catalog', () => {
  const raw = {
    schemaVersion: 1,
    kind: 'joyn-live-titles',
    entries: [{
      tmdbId: 11,
      type: 'movie',
      title: 'Star Wars',
      description: 'Vollständige TMDB-Beschreibung.',
      year: 1977,
      posterUrl: 'https://image.tmdb.org/t/p/w500/star-wars.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/star-wars.jpg',
      genre: 'Abenteuer · Science-Fiction',
      score: '8,2',
      metadataVersion: 3,
      metadataComplete: true,
      providerIds: ['disney'],
      airings: [{
        stationId: 'prosieben-de',
        stationName: 'ProSieben',
        programId: 'p1',
        startTime: '2026-09-26T18:15:00.000Z',
        stopTime: '2026-09-26T20:15:00.000Z',
        playbackRoutes: [{
          providerId: 'joyn',
          mode: 'WEB_LINK',
          target: 'https://www.joyn.de/live-tv/prosieben',
        }],
      }],
    }],
  }

  it('normalizes future Joyn airings by TMDB title identity', () => {
    const entries = normalizeJoynLiveTitles(raw, { now: Date.parse('2026-09-26T17:00:00.000Z') })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      key: 'movie:11',
      title: 'Star Wars',
      description: 'Vollständige TMDB-Beschreibung.',
      year: 1977,
      posterUrl: 'https://image.tmdb.org/t/p/w500/star-wars.jpg',
      genre: 'Abenteuer · Science-Fiction',
      score: '8,2',
      metadataVersion: 3,
      metadataComplete: true,
      providerIds: ['disney', 'joyn'],
    })
  })

  it('merges Joyn TV availability into normal catalog titles', () => {
    const entries = normalizeJoynLiveTitles(raw, { now: Date.parse('2026-09-26T17:00:00.000Z') })
    const [title] = mergeJoynLiveAvailability([{ tmdbId: 11, type: 'movie', providerIds: ['netflix'] }], entries, {
      now: Date.parse('2026-09-26T17:00:00.000Z'),
    })
    expect(title.providerIds).toEqual(['netflix', 'joyn'])
    expect(title.joynLive.airingCount).toBe(1)
  })

  it('uses the preserved exact Joyn playback route', () => {
    const entries = normalizeJoynLiveTitles(raw, { now: Date.parse('2026-09-26T17:00:00.000Z') })
    expect(getJoynLiveDestination(entries[0], { now: Date.parse('2026-09-26T17:00:00.000Z') }))
      .toBe('https://www.joyn.de/live-tv/prosieben')
  })
})
