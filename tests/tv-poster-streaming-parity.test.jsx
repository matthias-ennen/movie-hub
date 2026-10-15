import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import PosterCard from '../src/components/PosterCard.jsx'
import { resolvePosterProviderModel } from '../src/providers/posterProviderModel.js'
import { resolveProviderPresentation } from '../src/providers/providerPresentation.js'
import { providerOfferLabel } from '../src/providers/providerOfferLabels.js'
import { buildDetailLiveProviderEntries, buildDetailStreamingProviderIds } from '../src/components/detailProviderPresentation.js'
import { resetProviderSelectionSnapshot, updateProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'
import { providers } from '../src/data/catalog.js'

const offers = (entries) => entries.map(([id, type]) => ({ id, offerTypes: [type] }))
const cases = [
  ['Wächter über Himmel und Erde', 14797,
    [['joyn', 'ads'], ['netzkino', 'ads']],
    ['waipu', 'joyn', 'netzkino'],
    ['AIR', 'ADS', 'ADS']],
  ['Mikey', 87321,
    [['joyn', 'flatrate']],
    ['waipu', 'joyn'],
    ['AIR', 'FLAT']],
  ['Europa Report', 174772,
    [['joyn', 'flatrate'], ['netzkino', 'flatrate']],
    ['waipu', 'joyn', 'netzkino'],
    ['AIR', 'FLAT', 'FLAT']],
  ['Savage Dog', 437291,
    [['joyn', 'flatrate'], ['magenta', 'ads'], ['netzkino', 'flatrate'], ['youtube', 'ads']],
    ['waipu', 'joyn', 'magenta'],
    ['AIR', 'FLAT', 'ADS']],
]

beforeEach(() => {
  resetProviderSelectionSnapshot({ loading: false })
  updateProviderSelectionSnapshot({
    enabledProviderIds: ['moviehub', 'waipu', 'joyn', 'netzkino', 'magenta', 'youtube', 'pluto'],
  })
})

describe('#385 canonical TV poster and detail provider parity', () => {
  for (const [title, tmdbId, offerCases, expectedProviders, labels] of cases) {
    it(title + ' (' + tmdbId + ') – same first three providers and correct offer types', () => {
      const tmdbProviderOffers = offers(offerCases)
      const item = {
        id: 'tmdb-movie-' + tmdbId, type: 'movie', tmdbId, title, year: 2017,
        tmdbProviderOffers, tmdbProviderIds: tmdbProviderOffers.map((entry) => entry.id),
        tvAiring: { providerIds: ['waipu'], stationName: 'Testsender' },
      }
      const poster = resolvePosterProviderModel(item)
      expect(poster.providerIds).toEqual(expectedProviders)
      expect(poster.providerIds.map((id) => poster.offerLabels[id])).toEqual(labels)

      const live = resolveProviderPresentation(item, { context: 'airing' })
      const titleWide = resolveProviderPresentation(item, { context: 'title' })
      const liveEntries = buildDetailLiveProviderEntries(live, providers)
      const streamingIds = buildDetailStreamingProviderIds(titleWide, providers, liveEntries, item)
      // This is the canonical unique order on the detail page; it must match the poster prefix.
      const uniqueDetailProviders = [...new Set([
        ...liveEntries.map((entry) => entry.providerId),
        ...streamingIds,
      ])]
      expect(uniqueDetailProviders.slice(0, 3)).toEqual(expectedProviders)
      expect(streamingIds).toEqual(offerCases.map(([id]) => id).sort((a,b) => titleWide.providerIds.indexOf(a) - titleWide.providerIds.indexOf(b)))
      expect(liveEntries.map((entry) => entry.providerId)).toEqual(['waipu'])
      expect(providerOfferLabel(item, 'joyn', { context: 'airing' })).not.toBe('AIR')

      const markup = renderToStaticMarkup(createElement(PosterCard, { item, onOpen: () => {} }))
      expect((markup.match(/class="provider-badge provider-/g) || []).length).toBe(expectedProviders.length)
      for (const id of expectedProviders) expect(markup).toContain('provider-' + id)
    })
  }

  it('does not invent a Joyn AIR broadcast from the presence of Joyn VOD', () => {
    const item = {
      tmdbProviderOffers: [{ id: 'joyn', offerTypes: ['ads'] }],
      tvAiring: { providerIds: ['waipu'] },
    }
    expect(resolvePosterProviderModel(item).offerLabels.joyn).toBe('ADS')
    expect(resolveProviderPresentation(item, { context: 'airing' }).liveProviderIds).toEqual(['waipu'])
  })

  it('shows AIR for concrete Joyn simulcast, and keeps both VOD and AIR in the detail', () => {
    const item = {
      tmdbProviderOffers: [{ id: 'joyn', offerTypes: ['ads'] }],
      tvAiring: { providerIds: ['waipu', 'joyn'] },
    }
    const poster = resolvePosterProviderModel(item)
    expect(poster.providerIds).toEqual(['waipu', 'joyn'])
    expect(poster.offerLabels.joyn).toBe('AIR')
    const airing = resolveProviderPresentation(item, { context: 'airing' })
    const vod = resolveProviderPresentation(item, { context: 'title' })
    const liveEntries = buildDetailLiveProviderEntries(airing, providers)
    expect(liveEntries.map((entry) => entry.providerId)).toEqual(['waipu', 'joyn'])
    expect(buildDetailStreamingProviderIds(vod, providers, liveEntries, item)).toEqual(['joyn'])
    expect(providerOfferLabel(item, 'joyn', { context: 'title' })).toBe('ADS')
  })

  it('never invents an access type from a bare provider ID', () => {
    const item = { tmdbProviderIds: ['joyn'], tvAiring: { providerIds: ['waipu'] } }
    const poster = resolvePosterProviderModel(item)
    expect(poster.providerIds).toEqual(['waipu', 'joyn'])
    expect(poster.offerLabels.joyn).toBeNull()
  })
})
