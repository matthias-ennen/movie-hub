import { describe, expect, it } from 'vitest'
import { buildPersonalTopTen, buildProviderTopTen, insertTopTenRow } from '../src/catalog/topTenRows.js'

function title(id, type = 'movie', overrides = {}) {
  return {
    id: `tmdb-${type === 'series' ? 'series' : 'movie'}-${id}`,
    tmdbId: id,
    type,
    title: `Titel ${id}`,
    popularity: id,
    voteCount: id * 10,
    voteAverage: 7,
    ...overrides,
  }
}

describe('Top-10-Sonderreihen', () => {
  it('aggregiert normalisierte Anbieterpositionen und entfernt Dubletten', () => {
    const titles = [title(1), title(2), title(3), title(4)]
    const providerCatalogs = {
      netflix: { id: 'netflix', movieIds: [titles[0].id, titles[1].id, titles[2].id] },
      prime: { id: 'prime', movieIds: [titles[1].id, titles[0].id, titles[3].id] },
    }

    const result = buildProviderTopTen({
      providerCatalogs,
      titles,
      enabledProviderIds: ['netflix', 'prime'],
      mediaType: 'movie',
    })

    expect(result.map((item) => item.tmdbId)).toEqual([2, 1, 4, 3])
    expect(new Set(result.map((item) => item.tmdbId)).size).toBe(result.length)
  })

  it('berücksichtigt ausschließlich aktivierte Anbieter', () => {
    const titles = [title(1), title(2), title(3)]
    const result = buildProviderTopTen({
      providerCatalogs: {
        netflix: { id: 'netflix', movieIds: [titles[0].id, titles[1].id] },
        prime: { id: 'prime', movieIds: [titles[2].id] },
      },
      titles,
      enabledProviderIds: ['netflix'],
      mediaType: 'movie',
    })

    expect(result.map((item) => item.tmdbId)).toEqual([1, 2])
  })

  it('mischt Home bei ausreichender Auswahl aus fünf Filmen und fünf Serien', () => {
    const movies = Array.from({ length: 8 }, (_, index) => title(index + 1))
    const series = Array.from({ length: 8 }, (_, index) => title(index + 101, 'series'))
    const titles = [...movies, ...series]
    const result = buildProviderTopTen({
      providerCatalogs: {
        netflix: { id: 'netflix', homeIds: titles.map((item) => item.id) },
      },
      titles,
      enabledProviderIds: ['netflix'],
    })

    expect(result).toHaveLength(10)
    expect(result.filter((item) => item.type === 'movie')).toHaveLength(5)
    expect(result.filter((item) => item.type === 'series')).toHaveLength(5)
  })

  it('behandelt Movie Hub wie eine eigene aktivierbare Rangquelle', () => {
    const movieHubTitles = [title(1, 'movie', { popularity: 3 }), title(2, 'movie', { popularity: 9 })]
    const enabled = buildProviderTopTen({ movieHubTitles, enabledProviderIds: ['moviehub'], mediaType: 'movie' })
    const disabled = buildProviderTopTen({ movieHubTitles, enabledProviderIds: [], mediaType: 'movie' })

    expect(enabled.map((item) => item.tmdbId)).toEqual([2, 1])
    expect(disabled).toEqual([])
  })

  it('priorisiert im persönlichen Ranking Profil-, dann TMDB-Bewertung und dann Beliebtheit', () => {
    const local = title(1, 'movie', { popularity: 1 })
    const tmdb = title(2, 'movie', { tmdbRating: 10, popularity: 2 })
    const popular = title(3, 'movie', { popularity: 100 })
    const rows = [
      { id: 'favorites', items: [popular, local] },
      { id: 'tmdb', items: [tmdb, popular] },
    ]

    const result = buildPersonalTopTen(rows, (item) => ({ rating: item.tmdbId === 1 ? 4 : null }))
    expect(result.map((item) => item.tmdbId)).toEqual([1, 2, 3])
  })

  it('setzt die Sonderreihe nach drei tatsächlich vorhandenen Reihen ein', () => {
    const rows = [
      { id: 'one', items: [title(1)] },
      { id: 'empty', items: [] },
      { id: 'two', items: [title(2)] },
      { id: 'three', items: [title(3)] },
      { id: 'four', items: [title(4)] },
    ]

    const result = insertTopTenRow(rows, { id: 'top', title: 'Top 10', items: [title(9)] })
    expect(result.map((row) => row.id)).toEqual(['one', 'two', 'three', 'top', 'four'])
    expect(result[3].variant).toBe('top-ten')
  })

  it('zeigt kleine Datenbestände ohne Platzhalter vollständig an', () => {
    const items = [title(1), title(2)]
    const result = insertTopTenRow([], { id: 'top', title: 'Top 10', items })
    expect(result).toHaveLength(1)
    expect(result[0].items).toEqual(items)
  })
})
