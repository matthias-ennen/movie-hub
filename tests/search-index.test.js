import { describe, expect, it } from 'vitest'
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_RESULT_LIMIT,
  buildSearchIndexArtifact,
  buildSearchIndexEntries,
  mergeSearchIndexEntries,
  searchIndex,
} from '../src/search/searchIndex.js'

function title(overrides = {}) {
  return {
    id: 'tmdb-movie-1',
    tmdbId: 1,
    type: 'movie',
    title: 'Blade Runner',
    originalTitle: 'Blade Runner',
    year: 1982,
    posterUrl: 'https://image.example/poster.jpg',
    description: 'Long detail text that must not enter the search index.',
    cast: [{ name: 'Actor' }],
    videos: [{ url: 'https://example.test/trailer' }],
    providerIds: ['prime'],
    providerOffers: [{ id: 'prime', tmdbProviderId: 119, offerTypes: ['rent', 'buy'] }],
    accent: '#111111',
    accent2: '#222222',
    ...overrides,
  }
}

describe('skalierbarer Movie-Hub-Suchindex', () => {
  it('projects full catalog titles into compact search entries', () => {
    const [entry] = buildSearchIndexEntries([title()])

    expect(entry).toMatchObject({
      id: 'tmdb-movie-1',
      tmdbId: 1,
      type: 'movie',
      title: 'Blade Runner',
      year: 1982,
      providerIds: ['prime'],
    })
    expect(entry.providerOffers).toEqual([
      { id: 'prime', tmdbProviderId: 119, offerTypes: ['rent', 'buy'] },
    ])
    expect(entry).not.toHaveProperty('description')
    expect(entry).not.toHaveProperty('cast')
    expect(entry).not.toHaveProperty('videos')
  })

  it('preserves all structured provider offer types including rent and buy', () => {
    const artifact = buildSearchIndexArtifact({
      source: 'tmdb',
      language: 'de-DE',
      country: 'DE',
      generatedAt: '2026-09-11T08:00:00.000Z',
      titles: [title({
        providerOffers: [{
          id: 'prime',
          tmdbProviderId: 119,
          offerTypes: ['flatrate', 'free', 'ads', 'rent', 'buy'],
        }],
      })],
    })

    expect(artifact.kind).toBe('search-index')
    expect(artifact.count).toBe(1)
    expect(artifact.entries[0].providerOffers[0].offerTypes).toEqual([
      'flatrate', 'free', 'ads', 'rent', 'buy',
    ])
  })

  it('does not render a huge result set before a meaningful query exists', () => {
    const entries = buildSearchIndexEntries([title()])
    expect(SEARCH_MIN_QUERY_LENGTH).toBeGreaterThanOrEqual(2)
    expect(searchIndex(entries, '').results).toEqual([])
    expect(searchIndex(entries, 'b').results).toEqual([])
  })

  it('filters public results by the account-wide provider selection', () => {
    const entries = buildSearchIndexEntries([
      title({ id: 'tmdb-movie-1', title: 'Blade Runner', providerIds: ['prime'] }),
      title({ id: 'tmdb-movie-2', tmdbId: 2, title: 'Blade Runner 2049', providerIds: ['netflix'] }),
    ])

    const result = searchIndex(entries, 'blade', { enabledProviderIds: ['netflix'] })
    expect(result.results.map((entry) => entry.id)).toEqual(['tmdb-movie-2'])
  })

  it('keeps personal TMDB titles searchable independently of provider selection', () => {
    const publicEntries = buildSearchIndexEntries([
      title({ id: 'tmdb-movie-1', providerIds: ['prime'] }),
    ])
    const personalEntries = buildSearchIndexEntries([
      title({ id: 'tmdb-movie-1', providerIds: ['prime'] }),
      title({ id: 'tmdb-movie-3', tmdbId: 3, title: 'Blade Personal', providerIds: [] }),
    ], { scope: 'personal' })
    const entries = mergeSearchIndexEntries(publicEntries, personalEntries)

    const result = searchIndex(entries, 'blade', { enabledProviderIds: [] })
    expect(result.results.map((entry) => entry.id).sort()).toEqual([
      'tmdb-movie-1',
      'tmdb-movie-3',
    ].sort())
    expect(result.results.every((entry) => entry.scope === 'personal')).toBe(true)
  })

  it('limits the rendered result set while reporting the full match count', () => {
    const entries = Array.from({ length: SEARCH_RESULT_LIMIT + 15 }, (_, index) => title({
      id: `tmdb-movie-${index + 1}`,
      tmdbId: index + 1,
      title: `Testfilm ${index + 1}`,
    })).flatMap((item) => buildSearchIndexEntries([item]))

    const result = searchIndex(entries, 'testfilm', { enabledProviderIds: ['prime'] })
    expect(result.results).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(result.total).toBe(SEARCH_RESULT_LIMIT + 15)
    expect(result.hasMore).toBe(true)
  })
})
