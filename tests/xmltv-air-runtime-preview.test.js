import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createXmltvAirRouteRegistry, XMLTV_AIR_ROUTE_CANDIDATES } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { buildPrivateXmltvAirRuntimePreview } from '../scripts/xmltv-g3-private-air-runtime-preview.mjs'
import { discoverLiveSourceCatalogs } from '../scripts/live-availability-index.mjs'
import { buildTvRuntimeSnapshot } from '../src/tv/tvRuntimePublication.js'
import { buildLiveAvailabilityIndex } from '../src/sources/liveAvailabilityIndex.js'

const now = Date.parse('2026-11-16T00:00:00Z')
const zdf = XMLTV_AIR_ROUTE_CANDIDATES.find((row) => row.stationId === 'zdf')
const receipts = ['android', 'fire-tv'].map((device) => ({
  stationId: 'zdf', target: zdf.target, device, checkedAt: '2026-11-15T15:00:00Z',
  result: 'exact-channel-confirmed', viaMovieHub: true,
}))
const registry = createXmltvAirRouteRegistry({ deviceReceipts: receipts, now })
const event = {
  kind: 'broadcast', titleRef: { mediaType: 'movie', tmdbId: 42 }, channelId: 'zdf',
  channelName: 'ZDF', startAt: '2026-11-16T19:00:00Z', endAt: '2026-11-16T21:00:00Z',
  sourceRefs: [{ sourceId: 'xmltv:epgshare01', externalId: 'ZDF.de|test' }],
  extensions: { xmltv: { sourceStationId: 'ZDF.de', timestampsExplicitlyZoned: true, rawTitle: 'untrusted' } },
}
const catalog = { titles: [{ source: 'tmdb', type: 'movie', tmdbId: 42, title: 'Testfilm', posterPath: '/test.jpg',
  providerIds: ['zdf', 'air-zdf'], tmdbProviderOffers: [
    { id: 'zdf', offerTypes: ['free'] }, { id: 'air-zdf', offerTypes: ['buy'] },
  ] }] }
const waipu = { providerId: 'waipu', entries: [{ type: 'movie', tmdbId: 42, title: 'Testfilm', airings: [{
  canonicalStationId: 'zdf', stationId: 'waipu-zdf', stationName: 'ZDF',
  startTime: event.startAt, stopTime: event.endAt, programId: 'test',
  playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', scope: 'program', target: 'https://app.waipu.tv/epgdetails/zdf/test' }],
}] }] }

describe('G3b private XMLTV AIR indexes', () => {
  it('adds no station catalog without a verified route', () => {
    const preview = buildPrivateXmltvAirRuntimePreview({ confirmedEvents: [event], catalog, existingSources: [waipu], now, fieldsForEvent: createXmltvAirRouteRegistry({deviceReceipts:[],now}).fieldsForEvent })
    expect(preview.sourceCatalogs).toEqual([])
    expect(preview.counts.noApprovedRoute).toBe(1)
    expect(preview.tvRuntime.index.providers).toEqual(['waipu'])
  })
  it('merges identical broadcasts across sources and preserves separate exact playback routes', () => {
    const preview = buildPrivateXmltvAirRuntimePreview({ confirmedEvents: [event,
      { ...event, sourceRefs: [{ sourceId: 'xmltv:freeepg', externalId: 'ZDF.de|test' }] }],
      catalog, existingSources: [waipu], now, fieldsForEvent: registry.fieldsForEvent })
    expect(preview.counts).toMatchObject({ projected: 2, deduplicated: 1 })
    expect(preview.sourceCatalogs[0].entries[0].airings).toHaveLength(1)
    expect(JSON.stringify(preview.sourceCatalogs)).not.toContain('untrusted')
    const dayTitle = preview.tvRuntime.days[0].entries[0]
    expect(dayTitle.airings).toHaveLength(1)
    expect(dayTitle.airings[0].providerIds).toEqual(['air-zdf', 'waipu'])
    expect(dayTitle.airings[0].playbackRoutes).toHaveLength(2)
    expect(dayTitle.tmdbProviderIds).toEqual(['zdf'])
    expect(dayTitle.tmdbProviderOffers).toEqual([{ id: 'zdf', offerTypes: ['free'] }])
    expect(preview.liveAvailability.entries[0].providerIds).toEqual(['air-zdf', 'waipu'])
    expect(preview.liveAvailability.entries[0].providers[0].airings[0].playbackRoutes[0].target).toBe(zdf.target)
  })
  it('rejects expired events and leaves identities without catalog metadata unprojected', () => {
    const preview = buildPrivateXmltvAirRuntimePreview({ confirmedEvents: [
      { ...event, startAt: '2026-11-14T19:00:00Z', endAt: '2026-11-14T21:00:00Z' },
      { ...event, titleRef: { mediaType: 'movie', tmdbId: 99 } },
    ], catalog, now, fieldsForEvent: registry.fieldsForEvent })
    expect(preview.counts).toMatchObject({ rejectedTime: 1, missingCatalogTitle: 1, projected: 0 })
    expect(preview.sourceCatalogs).toEqual([])
  })
  it('rejects substituted routes at both runtime index boundaries', () => {
    const preview = buildPrivateXmltvAirRuntimePreview({ confirmedEvents: [event], catalog, now,
      fieldsForEvent: registry.fieldsForEvent })
    const source = preview.sourceCatalogs[0]
    const entry = source.entries[0]
    const airing = entry.airings[0]
    const badSource = { ...source, entries: [{ ...entry, airings: [
      { ...airing, playbackRoutes: [{ ...airing.playbackRoutes[0], target: 'https://www.zdf.de/' }] },
    ] }] }
    expect(buildTvRuntimeSnapshot({ sourceCatalogs: [badSource], catalog, now }).index.airingCount).toBe(0)
    expect(buildLiveAvailabilityIndex([badSource], { now }).count).toBe(0)
  })
  it('public disk discovery admits reviewed AIR IDs and ignores unknown ones', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moviehub-air-gate-'))
    try {
      for (const id of ['air-zdf', 'air-unknown', 'waipu']) {
        const path = join(dir, id + '-live')
        await mkdir(path)
        await writeFile(join(path, 'titles.json'), JSON.stringify({ entries: waipu.entries }))
      }
      const sources = await discoverLiveSourceCatalogs(dir, { resolveEpisodes: false })
      expect(sources.map((source) => source.providerId)).toEqual(['air-zdf','waipu'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
