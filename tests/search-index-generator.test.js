import { describe, expect, it } from 'vitest'
import {
  SEARCH_OFFER_TYPES,
  buildSearchDiscoverParams,
  mergeProviderSearchEntries,
  searchEntryFromDiscover,
} from '../scripts/generate-search-index.mjs'

const prime = {
  id: 'prime',
  label: 'Prime Video',
  aliases: ['amazonprimevideo', 'primevideo'],
}

function movie(id = 1, overrides = {}) {
  return {
    id,
    title: 'Testfilm',
    original_title: 'Test Movie',
    release_date: '2024-05-01',
    poster_path: '/poster.jpg',
    popularity: 42,
    ...overrides,
  }
}

describe('breiter Provider-Suchindex', () => {
  it('queries one provider and one offer type explicitly in Germany', () => {
    expect(buildSearchDiscoverParams([9], 'movie', 'rent', 3)).toMatchObject({
      language: 'de-DE',
      region: 'DE',
      watch_region: 'DE',
      with_watch_providers: '9',
      with_watch_monetization_types: 'rent',
      include_adult: false,
      page: 3,
    })
    expect(SEARCH_OFFER_TYPES).toEqual(['flatrate', 'free', 'ads', 'rent', 'buy'])
  })

  it('creates a compact search entry directly from TMDB discover data', () => {
    const entry = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'buy')

    expect(entry).toMatchObject({
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      title: 'Testfilm',
      originalTitle: 'Test Movie',
      year: 2024,
      providerIds: ['prime'],
    })
    expect(entry.posterUrl).toContain('/w500/poster.jpg')
    expect(entry.providerOffers).toEqual([
      { id: 'prime', tmdbProviderId: 9, offerTypes: ['buy'] },
    ])
    expect(entry).not.toHaveProperty('description')
    expect(entry).not.toHaveProperty('cast')
  })

  it('merges offer types for the same provider instead of duplicating the title', () => {
    const rent = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'rent')
    const buy = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'buy')
    const [merged] = mergeProviderSearchEntries([rent, buy])

    expect(merged.providerIds).toEqual(['prime'])
    expect(merged.providerOffers).toEqual([
      { id: 'prime', tmdbProviderId: 9, offerTypes: ['rent', 'buy'] },
    ])
  })

  it('merges different providers while keeping their offer types separate', () => {
    const primeEntry = searchEntryFromDiscover(movie(42), 'movie', prime, [9], 'flatrate')
    const netflixEntry = searchEntryFromDiscover(movie(42), 'movie', {
      id: 'netflix',
      label: 'Netflix',
      aliases: ['netflix'],
    }, [8], 'flatrate')

    const [merged] = mergeProviderSearchEntries([primeEntry, netflixEntry])
    expect(merged.providerIds.sort()).toEqual(['netflix', 'prime'])
    expect(merged.providerOffers).toEqual(expect.arrayContaining([
      { id: 'prime', tmdbProviderId: 9, offerTypes: ['flatrate'] },
      { id: 'netflix', tmdbProviderId: 8, offerTypes: ['flatrate'] },
    ]))
  })

  it('drops non-product membership markers when catalog entries are merged', () => {
    const [merged] = mergeProviderSearchEntries([{
      id: 'tmdb-movie-42',
      tmdbId: 42,
      type: 'movie',
      title: 'Testfilm',
      providerIds: ['prime'],
      providerOffers: [{ id: 'prime', tmdbProviderId: 9, offerTypes: ['catalog', 'rent'] }],
      scope: 'public',
    }])

    expect(merged.providerOffers[0].offerTypes).toEqual(['rent'])
  })
})
