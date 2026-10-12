import { describe, expect, it } from 'vitest'
import { catalogTmdbProviderIds, PROVIDER_OPTIONS } from '../src/settings/providerSelectionModel.js'
import { orderProviderIds } from '../src/providers/providerOrder.js'
import { orderTvStations, combinedTvStationOrder } from '../src/settings/stationOrder.js'
import { buildProviderCatalogModel, buildProviderBrowseRows, buildProviderHomeRows } from '../src/catalog/providerCatalogRows.js'
import { curateCatalogRows } from '../src/catalog/contentCuration.js'
import { createLiveProviderFilter } from '../src/sources/liveProviderSelection.js'
import { mergeLiveAvailability } from '../src/sources/liveAvailabilityIndex.js'
import { buildTvRuntimeSchedule, buildTvRuntimeHeroItems } from '../src/tv/tvRuntimeClient.js'
import { buildTv14DayRows } from '../src/tv/tv14DaySummary.js'
import { resolveProviderPresentation } from '../src/providers/providerPresentation.js'

const now = Date.parse('2026-10-12T10:00:00Z')
const airing = {
  stationId: 'zdf', providerStationIds: { waipu: 'zdf', joyn: 'zdf-de' },
  sourceStationId: 'zdf-de', stationName: 'ZDF',
  startTime: '2026-10-12T12:00:00Z', stopTime: '2026-10-12T14:00:00Z',
  providerIds: ['waipu', 'joyn'], playbackRoutes: [
    { providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'waipu://program' },
    { providerId: 'joyn', mode: 'WEB_LINK', target: 'https://www.joyn.de/live-tv/zdf' },
  ],
}
const title = { id: 'tmdb-movie-1', tmdbId: 1, type: 'movie', title: 'Film', popularity: 20 }
const live = { airings: [airing], nextAiring: airing }

describe('shared settings and catalog contract #387', () => {
  it('rejects null, blank, zero and invalid provider IDs without hiding valid array IDs', () => {
    expect(catalogTmdbProviderIds({
      missing: { id: 'missing', movieTmdbProviderId: null, seriesTmdbProviderId: '' },
      invalid: { id: 'invalid', movieTmdbProviderId: 0, seriesTmdbProviderId: -1 },
      valid: { id: 'valid', movieTmdbProviderIds: [null, 8] },
    })).toEqual(['valid'])
  })

  it('uses the same provider order for settings, badges and shuffled catalog rows', () => {
    const ids = ['netflix', 'joyn', 'disney', 'waipu', 'prime']
    const catalogs = Object.fromEntries(ids.map((id) => [id, { id, movieIds: [title.id] }]))
    const expected = ['waipu', 'joyn', 'disney', 'netflix', 'prime']
    expect(orderProviderIds(ids)).toEqual(expected)
    expect(PROVIDER_OPTIONS.filter(({ id }) => ids.includes(id)).map(({ id }) => id)).toEqual(expected)
    expect(buildProviderBrowseRows(catalogs, [title], 'movie').map(({ providerId }) => providerId)).toEqual(expected)
  })

  it('adds Waipu and Joyn TV to streaming candidates once, without mixing films and series tabs', () => {
    const titles = [
      { ...title, liveAvailability: { waipu: live, joyn: live } },
      { id: 'tmdb-series-2', tmdbId: 2, type: 'series', title: 'Serie', popularity: 100, liveAvailability: { joyn: live } },
    ]
    const model = buildProviderCatalogModel({ joyn: { id: 'joyn', movieIds: [title.id] } }, titles, { now })
    expect(model.waipu.movieIds).toEqual([title.id])
    expect(model.joyn.movieIds).toEqual([title.id])
    expect(model.joyn.seriesIds).toEqual(['tmdb-series-2'])
    expect(model.joyn.homeIds).toEqual(['tmdb-series-2', title.id])
    expect(buildProviderBrowseRows(model, titles, 'series').map(({ providerId }) => providerId)).toEqual(['joyn'])
  })

  it('applies profile sorting before the Home limit, including series after 50 movie candidates', () => {
    const titles = Array.from({ length: 50 }, (_, i) => ({ id: `film-${i}`, tmdbId: i + 10, type: 'movie', title: `Film ${i}`, popularity: 1 }))
    const series = { id: 'series-1', tmdbId: 1, type: 'series', title: 'Serie', popularity: 1000 }
    titles.push(series)
    const catalog = { netflix: { id: 'netflix', movieIds: titles.slice(0, 50).map((item) => item.id), seriesIds: [series.id] } }
    const rows = curateCatalogRows(buildProviderHomeRows(catalog, titles), { mode: 'popular' })
    expect(rows[0].items).toHaveLength(50)
    expect(rows[0].items[0]).toBe(series)
  })

  it('removes disabled or expired live evidence without losing Joyn streaming or personal title data', () => {
    const acceptLiveProvider = createLiveProviderFilter({ enabledProviderIds: ['joyn'], disabledJoynStationIds: ['zdf-de'] })
    const input = { ...title, tmdbProviderIds: ['joyn'], providerIds: ['joyn', 'waipu'], movieHubCatalog: true,
      liveAvailability: { waipu: live, joyn: live }, waipuLive: live, joynLive: live, tvAiringSoon: true }
    const [projected] = mergeLiveAvailability([input], [], { now, acceptLiveProvider })
    expect(projected.providerIds).toEqual(['joyn', 'moviehub'])
    expect(projected.liveAvailability).toEqual({})
    expect(projected.waipuLive).toBeUndefined()
    expect(projected.joynLive).toBeUndefined()
    expect(projected.tvAiringSoon).toBe(false)
    expect(resolveProviderPresentation(projected).providerIds).toEqual(['joyn'])
    expect(input.waipuLive).toBe(live)
    const [expired] = mergeLiveAvailability([input], [], { now: now + 86400000, acceptLiveProvider: () => true })
    expect(expired.liveAvailability).toEqual({})
  })

  it('applies global provider off consistently to merged day, hero and 14-day airings and routes', () => {
    const selection = { enabledProviderIds: ['joyn'], activeWaipuStationIds: ['zdf'], activeJoynStationIds: ['zdf-de'] }
    const entry = { ...title, airings: [airing], airingOptions: [airing] }
    const day = buildTvRuntimeSchedule({ entries: [entry] }, selection)
    const heroes = buildTvRuntimeHeroItems([entry], { ...selection, now })
    const rows = buildTv14DayRows({ entries: [entry], ...selection, now })
    for (const selected of [day.airings[0], heroes[0].tvAiring, rows[0].items[0].tvAiring]) {
      expect(selected.providerIds).toEqual(['joyn'])
      expect(selected.playbackRoutes.map(({ providerId }) => providerId)).toEqual(['joyn'])
      expect(selected.providerStationIds).toEqual({ joyn: 'zdf-de' })
    }
    expect(buildTvRuntimeSchedule({ entries: [entry] }, { ...selection, enabledProviderIds: [] }).airings).toEqual([])
    expect(buildTvRuntimeHeroItems([entry], { enabledProviderIds: [], now })).toEqual([])
    expect(buildTv14DayRows({ entries: [entry], ...selection, enabledProviderIds: [], now })).toEqual([])
  })

  it('uses common canonical sender positions and alphabetic unmatched channels independent of legacy sorting', () => {
    const waipu = [{ id: 'ard', name: 'Das Erste' }, { id: 'zdf', name: 'ZDF' }]
    const joyn = [{ id: 'extra-z', name: 'Zeta' }, { id: 'zdf-de', canonicalId: 'zdf', name: 'ZDF' }, { id: 'extra-a', name: 'Alpha' }]
    expect(orderTvStations(joyn, waipu).map(({ id }) => id)).toEqual(['zdf-de', 'extra-a', 'extra-z'])
    expect(combinedTvStationOrder(waipu, joyn, waipu)).toEqual(['ard', 'zdf', 'joyn.extra-a', 'joyn.extra-z'])
  })
})
