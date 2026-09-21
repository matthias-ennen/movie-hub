import { describe, expect, it } from 'vitest'
import { mergeLiveAiringStatus } from '../src/search/searchLiveAiringStatus.js'

describe('TV-Status im separaten Suchindex', () => {
  it('übernimmt den Status über Medientyp und TMDB-ID, aber keine TV-Zeitzeile', () => {
    const [result] = mergeLiveAiringStatus(
      [{ id: 'search-1', type: 'movie', tmdbId: 42, title: 'Treffer' }],
      [{
        id: 'catalog-42',
        type: 'movie',
        tmdbId: 42,
        tvAiringOnAir: true,
        tvAiringSoon: false,
        tvAiring: { stationName: 'ZDF' },
      }],
    )

    expect(result).toMatchObject({ tvAiringOnAir: true, tvAiringSoon: false })
    expect(result).not.toHaveProperty('tvAiring')
  })
})
