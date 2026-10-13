import { describe, expect, it } from 'vitest'
import { episodeReference } from '../src/catalog/episodeContext.js'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'
import { buildTvRuntimeSnapshot } from '../src/tv/tvRuntimePublication.js'
import { buildLiveAvailabilityIndex, normalizeLiveAvailabilityIndex } from '../src/sources/liveAvailabilityIndex.js'
import { prepareDetailRequestItem } from '../src/components/detailPresentation.js'

// Published SAT.1 GOLD event reproduced on 13.10.2026: Joyn has only the title,
// waipu supplies S3E3; both refer to this exact broadcast and TMDB series.
const now = Date.parse('2026-10-13T11:20:00Z')
const title = { type: 'series', tmdbId: 5021, title: 'Die Waltons' }
const base = { ...title, stationId: 'sat1gold', startTime: '2026-10-13T10:45:00.000Z', stopTime: '2026-10-13T11:35:00.000Z' }
const joyn = { ...base, stationId: 'sat1gold-de', canonicalStationId: 'sat1gold', providerIds: ['joyn'],
  episode: { seasonNumber: null, episodeNumber: null, title: 'Das Vollblut' } }
const waipu = { ...base, providerIds: ['waipu'], episode: { seasonNumber: 3, episodeNumber: 3, title: 'Das Vollblut' } }
const source = (airing) => ({ providerId: airing.providerIds[0], entries: [{ ...title, airings: [airing] }] })

describe('shared episode evidence for the same broadcast', () => {
  it.each([[joyn, waipu], [waipu, joyn]])('retains complete episode identity through the published runtime', (first, second) => {
    const merged = mergeTvAirings([first], [second])
    expect(merged).toHaveLength(1)
    expect(merged[0].episode).toEqual(waipu.episode)
    expect(merged[0].providerIds).toEqual(['joyn', 'waipu'])
    const runtime = buildTvRuntimeSnapshot({ sourceCatalogs: [source(first), source(second)], now })
    expect(runtime.days[0].entries[0].airings[0].episode).toEqual(waipu.episode)
  })

  it('reads partial neutral records with legacy number fields', () => {
    expect(episodeReference({ episode: { title: 'Das Vollblut' }, seasonNumber: 3, episodeNumber: '3' })).toEqual(waipu.episode)
    expect(episodeReference({ seasonNumber: null, episodeNumber: '' })).toBeNull()
  })

  it.each(['seasonNumber', 'episodeNumber'])('retains %s conflicts through subsequent merges and compaction', (field) => {
    const conflicting = { ...joyn, episode: { ...waipu.episode, [field]: 4 } }
    for (const order of [[conflicting, waipu], [waipu, conflicting]]) {
      const merged = mergeTvAirings(order, [waipu])[0]
      expect(merged.episode).toEqual({ seasonNumber: null, episodeNumber: null, title: 'Das Vollblut', conflict: true })
      const compacted = buildLiveAvailabilityIndex([source(merged)], { now })
      expect(normalizeLiveAvailabilityIndex(compacted, { now })[0].nextAiring.episode).toEqual(merged.episode)
    }
  })

  it('does not merge adjacent episodes or another station', () => {
    expect(mergeTvAirings([joyn], [{ ...waipu, stationId: 'anderer-sender' }])).toHaveLength(2)
    expect(mergeTvAirings([joyn], [{ ...waipu, startTime: base.stopTime, stopTime: '2026-10-13T12:25:00Z' }])).toHaveLength(2)
  })

  const prepare = (item, airings = [waipu]) => prepareDetailRequestItem(item, {
    loadComplete: async () => ({ ...title, liveAvailability: { waipu: { airings } } }),
    presentArtwork: (value) => value, liveAvailabilityNow: now,
  })

  it('fills an old incomplete opening using loaded evidence for exactly the same event', async () => {
    const result = await prepare({ ...title, tvAiring: joyn })
    expect(result.detailEpisode).toEqual(waipu.episode)
  })

  it('uses available airing evidence for general series entries too', async () => {
    expect((await prepare(title)).detailEpisode).toEqual(waipu.episode)
    expect((await prepare({ ...title, detailEpisode: null, tvAiring: joyn })).detailEpisode).toEqual(waipu.episode)
  })

  it('never borrows another airing or station to enrich a specific opening', async () => {
    expect((await prepare({ ...title, tvAiring: joyn }, [{ ...waipu, stationId: 'andere' }])).detailEpisode).toEqual(joyn.episode)
    expect((await prepare({ ...title, tvAiring: joyn }, [{ ...waipu,
      startTime: '2026-10-14T10:45:00Z', stopTime: '2026-10-14T11:35:00Z' }])).detailEpisode).toEqual(joyn.episode)
  })
})
