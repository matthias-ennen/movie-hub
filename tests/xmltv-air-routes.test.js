import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  XMLTV_AIR_ROUTE_CANDIDATES, APPROVED_XMLTV_AIR_PROVIDERS, XMLTV_AIR_PUBLISH_ENABLED,
  createXmltvAirRouteRegistry, xmltvAirFieldsForEvent,
} from '../src/sources/xmltv/xmltvAirRoutes.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { PROVIDER_BY_ID, TMDB_PROVIDER_REGISTRY } from '../src/providers/providerRegistry.js'
import { providerOfferLabel } from '../src/providers/providerOfferLabels.js'
import { resolveProviderPresentation } from '../src/providers/providerPresentation.js'
import { getItemLiveProviderRoute } from '../src/sources/liveAvailabilityIndex.js'
import { launchProviderPlaybackRoute } from '../src/providers/providerPlaybackLaunch.js'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'
import { projectXmltvAiring } from '../scripts/xmltv-g1b-match-preview.mjs'

const checkedAt = '2026-11-15T15:00:00.000Z'
const now = Date.parse('2026-11-16T00:00:00.000Z')
const receipts = (candidate) => ['android', 'fire-tv'].map((device) => ({
  stationId: candidate.stationId, target: candidate.target, device, checkedAt,
  result: 'exact-channel-confirmed', viaMovieHub: true,
}))
const eventFor = (candidate, source = 'epgshare01') => {
  const raw = Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[source])
    .find(([, station]) => station.stationId === candidate.stationId)[0]
  return { kind: 'broadcast', titleRef: { mediaType: 'movie', tmdbId: 42 },
    channelId: candidate.stationId, channelName: candidate.label,
    startAt: '2026-11-17T19:00:00Z', endAt: '2026-11-17T21:00:00Z',
    sourceRefs: [{ sourceId: 'xmltv:' + source, externalId: raw + '|test' }],
    extensions: { xmltv: { sourceStationId: raw, timestampsExplicitlyZoned: true } },
  }
}

describe('XMLTV G3 verified sender-only routes', () => {
  it('keeps all six unapproved stations private and out of the VOD catalogue', () => {
    expect(XMLTV_AIR_ROUTE_CANDIDATES).toHaveLength(6)
    expect(XMLTV_AIR_PUBLISH_ENABLED).toBe(false)
    expect(APPROVED_XMLTV_AIR_PROVIDERS).toEqual([])
    for (const row of XMLTV_AIR_ROUTE_CANDIDATES) {
      expect(PROVIDER_BY_ID[row.providerId]).toBeUndefined()
      expect(TMDB_PROVIDER_REGISTRY.some((provider) => provider.id === row.providerId)).toBe(false)
      expect(xmltvAirFieldsForEvent(eventFor(row))).toEqual({ providerIds: [], playbackRoutes: [] })
      expect(projectXmltvAiring(eventFor(row)).playbackRoutes).toEqual([])
    }
  })

  it('requires two matching, unique, successful in-app device receipts', () => {
    const row = XMLTV_AIR_ROUTE_CANDIDATES[0]
    const [android, fire] = receipts(row)
    for (const invalid of [
      [android], [fire], [android, android, fire],
      [android, { ...fire, target: 'https://example.org' }],
      [android, { ...fire, result: 'failed' }],
      [android, { ...fire, viaMovieHub: false }],
      [android, { ...fire, checkedAt: '2026-11-14T00:00:00Z' }],
      [android, { ...fire, checkedAt: '2026-11-17T00:00:00Z' }],
    ]) expect(createXmltvAirRouteRegistry({ deviceReceipts: invalid, now }).providers).toEqual([])
    const registry = createXmltvAirRouteRegistry({ deviceReceipts: [android, fire], now })
    expect(registry.providers.map((provider) => provider.id)).toEqual([row.providerId])
    expect(registry.providers[0].searchUrl).toBeNull()
  })

  it.each(XMLTV_AIR_ROUTE_CANDIDATES)('binds $label to reviewed source stations only', (row) => {
    const registry = createXmltvAirRouteRegistry({ deviceReceipts: receipts(row), now })
    for (const source of ['epgshare01', 'freeepg', 'iptv-epg-org']) {
      const event = eventFor(row, source)
      const fields = registry.fieldsForEvent(event)
      expect(fields.providerIds).toEqual([row.providerId])
      expect(fields.providerStationIds).toEqual({ [row.providerId]: row.stationId })
      expect(fields.playbackRoutes[0]).toMatchObject({
        providerId: row.providerId, scope: 'channel', mode: 'WEB_LINK',
        target: row.target, verifiedAt: checkedAt,
        requiresAuth: row.requiresAuth, requiresSubscription: row.requiresSubscription,
      })
      for (const altered of [
        { ...event, channelName: 'Wrong station' },
        { ...event, sourceRefs: [{ sourceId: 'xmltv:unknown', externalId: event.sourceRefs[0].externalId }] },
        { ...event, sourceRefs: [{ sourceId: event.sourceRefs[0].sourceId, externalId: 'wrong|test' }] },
        { ...event, extensions: { xmltv: { sourceStationId: 'unknown', timestampsExplicitlyZoned: true } } },
        { ...event, extensions: { xmltv: { ...event.extensions.xmltv, timestampsExplicitlyZoned: false } } },
      ]) expect(registry.fieldsForEvent(altered).providerIds).toEqual([])
    }
  })

  it('retains separate Waipu and XMLTV routes for one broadcast and launches the exact channel only', () => {
    const row = XMLTV_AIR_ROUTE_CANDIDATES.find((entry) => entry.stationId === 'zdf')
    const registry = createXmltvAirRouteRegistry({ deviceReceipts: receipts(row), now })
    const event = eventFor(row)
    const airing = { ...projectXmltvAiring(event), ...registry.fieldsForEvent(event) }
    const waipu = { ...airing, source: 'waipu', providerIds: ['waipu'],
      providerStationIds: { waipu: 'zdf-waipu' }, playbackRoutes: [{
        providerId: 'waipu', mode: 'APP_DEEP_LINK', scope: 'program', target: 'https://app.waipu.tv/epgdetails/zdf/test',
      }] }
    const [merged] = mergeTvAirings([waipu], [airing])
    expect(merged.providerIds).toEqual(['air-zdf', 'waipu'])
    expect(merged.providerStationIds).toEqual({ 'air-zdf': 'zdf', waipu: 'zdf-waipu' })
    const item = { tvAiring: merged, providerIds: ['zdf', 'air-zdf'] }
    expect(providerOfferLabel(item, 'air-zdf', { context: 'airing' })).toBe('AIR')
    expect(resolveProviderPresentation(item, { context: 'airing' }).tmdbProviderIds).toEqual(['zdf'])
    const route = getItemLiveProviderRoute(item, 'air-zdf')
    const nativeBridge = { openProviderRoute: vi.fn() }
    expect(launchProviderPlaybackRoute({ providerId: 'air-zdf', title: 'Test',
      route, fallbackUrl: 'https://www.zdf.de/', nativeBridge })).toBe(true)
    expect(nativeBridge.openProviderRoute).toHaveBeenCalledWith('air-zdf', 'Test', 'WEB_LINK',
      'channel', row.target, row.target)
  })

  it('does not turn a sender into FLAT, FREE or other title offer', () => {
    const item = { tmdbProviderIds: ['air-rtl', 'rtlplus'],
      tmdbProviderOffers: [{ id: 'air-rtl', offerTypes: ['free'] }],
      verifiedTitleOffers: [{ id: 'air-rtl', offerTypes: ['buy'] }] }
    expect(providerOfferLabel(item, 'air-rtl')).toBeNull()
    expect(resolveProviderPresentation(item).providerIds).toEqual(['rtlplus'])
    expect(providerOfferLabel({ ...item, liveAvailability: { 'air-rtl': { airings: [{}] } } }, 'air-rtl')).toBe('AIR')
  })

  it('shares the exact native allowlist with the curated registry', () => {
    const native = readFileSync(new URL('../android/app/src/main/java/de/matthiasennen/moviehub/ProviderUrlPolicy.java',
      import.meta.url), 'utf8')
    for (const row of XMLTV_AIR_ROUTE_CANDIDATES) {
      expect(native).toContain('case "' + row.providerId + '": return "' + row.target + '";')
    }
  })
})
