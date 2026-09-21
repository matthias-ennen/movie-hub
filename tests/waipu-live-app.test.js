import { describe, expect, it, vi } from 'vitest'
import {
  WAIPU_LIVE_TITLES_URL,
  advanceWaipuLiveTitles,
  formatWaipuLiveAiring,
  loadWaipuLiveTitles,
  mergeWaipuLiveAvailability,
  normalizeWaipuLiveTitles,
} from '../src/waipu/waipuLiveCatalog.js'

const rawCatalog = {
  schemaVersion: 1,
  kind: 'waipu-live-titles',
  entries: [{
    tmdbId: 667739,
    type: 'movie',
    title: 'The Man from Toronto',
    airings: [
      {
        programId: 'zdf-expired',
        stationId: 'zdf',
        stationName: 'ZDF',
        startTime: '2026-09-19T08:00:00.000Z',
        stopTime: '2026-09-19T10:00:00.000Z',
      },
      {
        programId: 'rtl-current',
        stationId: 'rtl',
        stationName: 'RTL',
        startTime: '2026-09-20T18:15:00.000Z',
        stopTime: '2026-09-20T20:00:00.000Z',
      },
      {
        programId: 'zdf-next',
        stationId: 'zdf',
        stationName: 'ZDF',
        startTime: '2026-09-22T20:15:00.000Z',
        stopTime: '2026-09-22T22:00:00.000Z',
      },
    ],
  }],
}

describe('Waipu live app catalog', () => {
  it('drops expired broadcasts and advances to the next scheduled airing', () => {
    const entries = normalizeWaipuLiveTitles(rawCatalog, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      key: 'movie:667739',
      airingCount: 2,
      nextAiring: { stationName: 'RTL', startTime: '2026-09-20T18:15:00.000Z' },
    })
    expect(entries[0].nextAiring).toMatchObject({ source: 'waipu', programId: 'rtl-current' })
  })

  it('adds Waipu only to the exact TMDB id and media type', () => {
    const entries = normalizeWaipuLiveTitles(rawCatalog, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    const titles = mergeWaipuLiveAvailability([
      { tmdbId: 667739, type: 'movie', providerIds: ['netflix'] },
      { tmdbId: 667739, type: 'series', providerIds: ['prime'] },
    ], entries)
    expect(titles[0].providerIds).toEqual(['netflix', 'waipu'])
    expect(titles[0].waipuLive.airingCount).toBe(2)
    expect(titles[0].waipuLive.airings.map(({ programId }) => programId)).toEqual([
      'rtl-current',
      'zdf-next',
    ])
    expect(titles[1]).not.toHaveProperty('waipuLive')
  })

  it('adds global BALD and ON AIR state without a TV-only airing row', () => {
    const entries = normalizeWaipuLiveTitles(rawCatalog, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    const baseTitle = { tmdbId: 667739, type: 'movie', title: 'The Man from Toronto' }

    const [soon] = mergeWaipuLiveAvailability([baseTitle], entries, {
      now: Date.parse('2026-09-20T16:15:00.000Z'),
    })
    expect(soon).toMatchObject({ tvAiringOnAir: false, tvAiringSoon: true })
    expect(soon).not.toHaveProperty('tvAiring')

    const [onAir] = mergeWaipuLiveAvailability([baseTitle], entries, {
      now: Date.parse('2026-09-20T18:30:00.000Z'),
    })
    expect(onAir).toMatchObject({ tvAiringOnAir: true, tvAiringSoon: false })

    const [later] = mergeWaipuLiveAvailability([baseTitle], entries, {
      now: Date.parse('2026-09-20T20:30:00.000Z'),
    })
    expect(later).toMatchObject({ tvAiringOnAir: false, tvAiringSoon: false })
  })

  it('advances an already loaded catalog without another deploy or network request', () => {
    const entries = normalizeWaipuLiveTitles(rawCatalog, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    const advanced = advanceWaipuLiveTitles(entries, {
      now: Date.parse('2026-09-21T12:00:00.000Z'),
    })
    expect(advanced[0]).toMatchObject({
      airingCount: 1,
      nextAiring: { stationName: 'ZDF', startTime: '2026-09-22T20:15:00.000Z' },
    })
  })

  it('formats the compact German schedule in the Berlin time zone', () => {
    const [entry] = normalizeWaipuLiveTitles(rawCatalog, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    const label = formatWaipuLiveAiring(entry.nextAiring)
    expect(label).toContain('Sonntag, 20. September')
    expect(label).toContain('20:15 Uhr')
    expect(label).not.toContain('22:00')
    expect(label).toContain('RTL')
  })

  it('adds Waipu season, episode and episode title to the schedule label', () => {
    const label = formatWaipuLiveAiring({
      stationName: 'ZDF',
      startTime: '2026-09-20T18:15:00.000Z',
      stopTime: '2026-09-20T20:00:00.000Z',
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: 'Das Leck',
    })
    expect(label).toContain('Staffel 2 · Folge 7 · Das Leck')
  })

  it('keeps a legacy fallback catalog readable when source ids are still missing', () => {
    const legacyCatalog = structuredClone(rawCatalog)
    delete legacyCatalog.entries[0].airings[1].programId
    const [entry] = normalizeWaipuLiveTitles(legacyCatalog, {
      now: Date.parse('2026-09-19T12:00:00.000Z'),
    })
    expect(entry.nextAiring).toMatchObject({ source: 'waipu', programId: null })
  })

  it('removes a Waipu-only title immediately after its final broadcast', () => {
    const entries = normalizeWaipuLiveTitles(rawCatalog, {
      now: Date.parse('2026-09-23T00:00:00.000Z'),
    })
    expect(entries).toEqual([])
    expect(mergeWaipuLiveAvailability([{ tmdbId: 667739, type: 'movie', providerIds: [] }], entries))
      .toEqual([{ tmdbId: 667739, type: 'movie', providerIds: [] }])
  })

  it('fails softly when no published title index exists yet', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }))
    await expect(loadWaipuLiveTitles({ fetchImpl })).resolves.toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith(WAIPU_LIVE_TITLES_URL, { cache: 'no-store' })
  })
})
