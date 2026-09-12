import { describe, expect, it } from 'vitest'
import {
  MAX_PERSONAL_SMART_ROWS,
  buildPersonalSmartRows,
  finalizePersonalSmartCatalog,
  getPersonalSmartRowMatchCount,
  normalizePersonalSmartRowSettings,
} from '../src/catalog/personalSmartRows.js'

function title(id, overrides = {}) {
  return {
    id,
    title: id,
    popularity: 1,
    voteCount: 1,
    voteAverage: 1,
    year: 2000,
    facets: {
      castPersonIds: [],
      creatorPersonIds: [],
      keywordIds: [],
      collectionId: null,
      decade: 2000,
    },
    ...overrides,
  }
}

describe('profilbezogene persönliche Reihen', () => {
  it('normalisiert sichere, eindeutige Reihen und begrenzt sie auf zehn', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `row-${index}`,
      type: 'cast',
      valueId: index + 1,
      valueLabel: `Person ${index + 1}`,
      title: `Mit Person ${index + 1}`,
    }))
    rows.splice(1, 0, { ...rows[0], id: 'duplicate-filter' })
    rows.splice(2, 0, { id: 'invalid', type: 'unknown', valueId: 99, valueLabel: 'Ungültig' })

    const normalized = normalizePersonalSmartRowSettings({ rows })
    expect(normalized.rows).toHaveLength(MAX_PERSONAL_SMART_ROWS)
    expect(normalized.rows.map((row) => row.valueId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(normalized.rows.every((row, index) => row.order === index)).toBe(true)
  })

  it('bildet alle fünf Filtertypen, entfernt Duplikate und sortiert nach Katalograng', () => {
    const titles = [
      title('movie-a', { popularity: 10, facets: { castPersonIds: [1], creatorPersonIds: [2], keywordIds: [3], collectionId: 4, decade: 1990 } }),
      title('series-b', { popularity: 20, facets: { castPersonIds: [1], creatorPersonIds: [2], keywordIds: [3], collectionId: null, decade: 1990 } }),
      title('other', { popularity: 100 }),
      title('movie-a', { popularity: 99, facets: { castPersonIds: [1] } }),
    ]
    const settings = { rows: [
      { id: 'cast', type: 'cast', valueId: 1, valueLabel: 'Person', title: 'Mit Person' },
      { id: 'creator', type: 'creator', valueId: 2, valueLabel: 'Regie', title: 'Von Regie' },
      { id: 'keyword', type: 'keyword', valueId: 3, valueLabel: 'Thema', title: 'Thema: Thema' },
      { id: 'collection', type: 'collection', valueId: 4, valueLabel: 'Reihe', title: 'Reihe' },
      { id: 'decade', type: 'decade', valueId: 1990, valueLabel: '1990er', title: 'Die 1990er' },
    ] }

    const rows = buildPersonalSmartRows(titles, settings)
    expect(rows.map((row) => row.items.map((item) => item.id))).toEqual([
      ['series-b', 'movie-a'],
      ['series-b', 'movie-a'],
      ['series-b', 'movie-a'],
      ['movie-a'],
      ['series-b', 'movie-a'],
    ])
    expect(getPersonalSmartRowMatchCount(titles, settings.rows[0])).toBe(2)
  })

  it('behält deaktivierte und leere Definitionen, rendert sie aber nicht', () => {
    const settings = { rows: [
      { id: 'off', type: 'cast', valueId: 1, valueLabel: 'Person', title: 'Aus', enabled: false },
      { id: 'empty', type: 'keyword', valueId: 99, valueLabel: 'Leer', title: 'Leer' },
    ] }
    expect(normalizePersonalSmartRowSettings(settings).rows).toHaveLength(2)
    expect(buildPersonalSmartRows([title('x')], settings)).toEqual([])
  })

  it('verdichtet Rohmetadaten zu Titel-Facetten und katalogweiten Vorschlägen', () => {
    const source = [{
      id: 'movie-1',
      title: 'Beispiel',
      year: 1997,
      smartFacets: {
        cast: [{ id: 10, name: 'Darsteller', profileUrl: 'https://image.test/person.jpg' }],
        creators: [{ id: 20, name: 'Regie' }],
        keywords: [{ id: 30, name: 'Zeitreise' }],
        collection: { id: 40, name: 'Beispiel-Reihe' },
      },
    }]

    const finalized = finalizePersonalSmartCatalog(source)
    expect(finalized.titles[0]).not.toHaveProperty('smartFacets')
    expect(finalized.titles[0].facets).toEqual({
      castPersonIds: [10],
      creatorPersonIds: [20],
      keywordIds: [30],
      collectionId: 40,
      decade: 1990,
    })
    expect(finalized.smartFilterOptions.cast[0]).toMatchObject({ id: 10, label: 'Darsteller', count: 1 })
    expect(finalized.smartFilterOptions.creator[0]).toMatchObject({ id: 20, label: 'Regie', count: 1 })
    expect(finalized.smartFilterOptions.keyword[0]).toMatchObject({ id: 30, label: 'Zeitreise', count: 1 })
    expect(finalized.smartFilterOptions.collection[0]).toMatchObject({ id: 40, label: 'Beispiel-Reihe', count: 1 })
    expect(finalized.smartFilterOptions.decade[0]).toMatchObject({ id: 1990, label: '1990er', count: 1 })
  })
})
