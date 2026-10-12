import { buildTitleCandidateInventory } from '../scripts/build-title-candidate-inventory.mjs'
import { buildTitlePriorityPreview } from '../scripts/build-title-priority-preview.mjs'
import { buildCanonicalFanoutPlan, executeTitlePriorityQueue } from '../scripts/execute-title-priority-queue.mjs'
import { describe, expect, it, vi } from 'vitest'
import { buildPersonalSmartFilterOptions, buildPersonalSmartRows, finalizePersonalSmartCatalog, getPersonalSmartRowMatchCount, preparePersonalSmartTitles } from '../src/catalog/personalSmartRows.js'
import { copyTitleFacetMetadata, hasTitleFacetMetadata, readTitleFacets } from '../src/catalog/titleFacets.js'
import { mergeEnrichedTitle } from '../src/catalog/titleMetadata.js'
import { mergeCatalogWithPersonalSnapshots } from '../src/library/personalRows.js'
import { createTitleSnapshot } from '../src/library/libraryState.js'
import { hydratePersonalTitleState } from '../src/library/personalTitleMetadata.js'
import { buildSharedMediaTitleRef, mergeSharedMediaCatalogTitles, mergeTitlesWithSharedMediaCatalog } from '../src/library/sharedMediaCatalogModel.js'
import { mergePublicAndPersonalCatalog, nativeTitleToFirestore, normalizePersonalTmdbTitle } from '../src/tmdb/tmdbCatalogModel.js'
import { enrichSharedMediaTitleRef } from '../scripts/enrich-shared-media-metadata.mjs'

function title(id, extra = {}) {
  return {
    id: `tmdb-movie-${id}`, tmdbId: id, type: 'movie', mediaType: 'movie', title: `Film ${id}`,
    year: 2007, releaseDate: '2007-01-01', collectionId: 40, collectionName: 'Filmreihe',
    smartFacets: {
      version: 1, cast: [{ id: 2299, name: 'Josh Hartnett' }],
      creators: [{ id: 20, name: 'Regie' }], keywords: [{ id: 30, name: 'Thema' }],
      collection: { id: 40, name: 'Filmreihe' },
    },
    ...extra,
  }
}
const rows = [
  ['cast', 2299, 'Josh Hartnett'], ['creator', 20, 'Regie'], ['keyword', 30, 'Thema'],
  ['collection', 40, 'Filmreihe'], ['decade', 2000, '2000er'],
].map(([type, valueId, valueLabel]) => ({ id: type, type, valueId, valueLabel }))

describe('gemeinsamer Titelbestand für persönliche Smart-Reihen', () => {
  it('verwendet alle Quellen für jede Facette und dieselben Treffer in Auswahl, Zähler und Reihe', () => {
    const published = finalizePersonalSmartCatalog([title(1)])
    const personal = normalizePersonalTmdbTitle(nativeTitleToFirestore({ ...title(2), favorite: true }, null))
    const sharedRef = buildSharedMediaTitleRef(title(3))
    const base = mergePublicAndPersonalCatalog(published.titles, [personal])
    const shared = mergeSharedMediaCatalogTitles([{ key: 'movie-3', titleRef: sharedRef }], base)
    const titles = mergeTitlesWithSharedMediaCatalog(base, shared)
    const snapshot = createTitleSnapshot(title(4, { title: '30 Days of Night' }))
    const prepared = preparePersonalSmartTitles(mergeCatalogWithPersonalSnapshots(titles, {
      'movie-4': { watchlist: true, titleSnapshot: snapshot },
    }))
    const options = buildPersonalSmartFilterOptions(prepared, published.smartFilterOptions, published.titles)
    for (const row of rows) {
      expect(getPersonalSmartRowMatchCount(prepared, row)).toBe(4)
      expect(options[row.type].find((entry) => entry.id === row.valueId)?.count).toBe(4)
      expect(buildPersonalSmartRows(prepared, { rows: [row] })[0].items.map((item) => item.tmdbId).sort()).toEqual([1, 2, 3, 4])
    }
    // Profile-only titles are not retained in a global cache after a switch.
    expect(getPersonalSmartRowMatchCount(preparePersonalSmartTitles(titles), rows[0])).toBe(3)
    expect(published.smartFilterOptions.cast[0].count).toBe(1)
  })

  it('berechnet Änderungen gegenüber dem veröffentlichten Verzeichnis ohne dessen Zählung zu verändern', () => {
    const baseline = finalizePersonalSmartCatalog([title(1), title(2)])
    const next = preparePersonalSmartTitles([title(1), title(3, {
      smartFacets: { cast: [{ id: 7, name: 'Andere Person' }], creators: [], keywords: [] },
    })])
    const delta = buildPersonalSmartFilterOptions(next, baseline.smartFilterOptions, baseline.titles)
    const fresh = buildPersonalSmartFilterOptions(next)
    for (const { type } of rows) {
      expect(delta[type].map(({ id, count }) => ({ id, count })))
        .toEqual(fresh[type].map(({ id, count }) => ({ id, count })))
    }
    expect(baseline.smartFilterOptions.cast[0].count).toBe(2)
  })

  it('zählt kanonische Duplikate einmal und wendet Limits erst nach dem vollständigen Abgleich an', () => {
    const prepared = preparePersonalSmartTitles([
      title(1), title(1, { id: 'old-import-id' }), title(2),
      title(1, { id: 'tmdb-series-1', type: 'series' }),
    ])
    expect(getPersonalSmartRowMatchCount(prepared, rows[0])).toBe(3)
    expect(buildPersonalSmartFilterOptions(prepared).cast[0].count).toBe(3)
    const sorted = vi.fn((items) => items.sort((a, b) => b.tmdbId - a.tmdbId))
    expect(buildPersonalSmartRows(prepared, { rows: [rows[0]] }, 1, sorted)[0].items[0].tmdbId).toBe(2)
    expect(sorted.mock.calls[0][0]).toHaveLength(3)
  })

  it('erhält vollständige Besetzungen über Server, Manifest, TMDB-Speicherung und Profilsnapshot', async () => {
    const cast = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Person ${index + 1}` }))
    const enriched = await enrichSharedMediaTitleRef(title(10), {
      fetchTmdb: async () => ({ id: 10, title: 'Ensemble', release_date: '2007-01-01',
        credits: { cast, crew: [] }, keywords: { keywords: [] }, belongs_to_collection: null,
      }),
    })
    expect(enriched.cast).toHaveLength(8)
    expect(enriched.smartFacets.cast).toHaveLength(25)
    const stored = nativeTitleToFirestore({ ...enriched, mediaType: 'movie' }, null)
    expect(stored.smartFacets.cast).toHaveLength(25)
    const snapshot = createTitleSnapshot(normalizePersonalTmdbTitle(stored))
    const prepared = preparePersonalSmartTitles([snapshot])
    expect(getPersonalSmartRowMatchCount(prepared, { type: 'cast', valueId: 25 })).toBe(1)
    expect(buildPersonalSmartFilterOptions(prepared).cast.find((entry) => entry.id === 25)?.label).toBe('Person 25')
    expect(hasTitleFacetMetadata(snapshot)).toBe(true)
  })

  it('bewahrt Facetten beim bestehenden kanonischen Nachladen persönlicher Titel', async () => {
    const detail = title(4, {
      canonicalPublished: true, metadataVersion: 3, metadataComplete: true, collectionChecked: true,
      collectionId: null,
      metadataChecks: Object.fromEntries(['details', 'artwork', 'ageRating', 'credits', 'keywords', 'videos', 'providers', 'collection'].map((key) => [key, 'present'])),
    })
    const state = await hydratePersonalTitleState({ favorite: true,
      titleRef: { catalogId: detail.id, tmdbId: 4, type: 'movie' },
    }, { loadDetail: async () => detail })
    expect(state.canonicalReady).toBe(true)
    expect(readTitleFacets(state.titleSnapshot).castPersonIds).toContain(2299)
    expect(readTitleFacets(state.titleSnapshot).keywordIds).toContain(30)
  })

  it('verliert öffentliche ID-Listen nicht beim Zusammenführen schwächerer persönlicher Daten', () => {
    const base = finalizePersonalSmartCatalog([title(1) ]).titles[0]
    const merged = mergeEnrichedTitle(base, { ...title(1), smartFacets: {}, facets: { castPersonIds: [99] } })
    expect(readTitleFacets(merged)).toMatchObject({ castPersonIds: [2299, 99], creatorPersonIds: [20], keywordIds: [30] })
  })

  it('übernimmt neue persönliche Auswahlwerte und erzeugt keine erfundenen IDs oder Jahrzehnte', () => {
    const prepared = preparePersonalSmartTitles([title(1, { smartFacets: { cast: [{ id: '7', name: 'Neue Person' }, { id: null, name: 'Ungültig' }] }, year: null, releaseDate: null })])
    expect(buildPersonalSmartFilterOptions(prepared).cast).toMatchObject([{ id: 7, label: 'Neue Person', count: 1 }])
    expect(readTitleFacets({ year: null }).decade).toBeNull()
    expect(readTitleFacets({ type: 'series', facets: { collectionId: 40 } }).collectionId).toBeNull()
    expect(readTitleFacets({ collectionChecked: true, collectionId: null, smartFacets: { collection: { id: 40 } } }).collectionId).toBeNull()
    expect(readTitleFacets({ facets: { castPersonIds: [null, 0, -1, '7', 7, 1.5] } }).castPersonIds).toEqual([7])
    expect(hasTitleFacetMetadata(copyTitleFacetMetadata({ cast: [{ id: 7, name: 'Person' }] }))).toBe(false)
    expect(hasTitleFacetMetadata({ smartFacets: { cast: [], creators: [], keywords: [] } })).toBe(false)
  })
})


describe('bestehende kanonische Datenpflege für Filtermetadaten', () => {
  it('erkennt alte Referenzen, nutzt vorhandene vollständige Daten und beendet die Reparatur danach', async () => {
    const complete = title(10, { metadataVersion: 3, metadataComplete: true, collectionChecked: true,
      collectionId: null, metadataUpdatedAt: '2026-10-12T00:00:00Z',
      metadataChecks: Object.fromEntries(['details', 'artwork', 'ageRating', 'credits', 'keywords', 'videos', 'providers', 'collection'].map((key) => [key, 'present'])),
    })
    const published = finalizePersonalSmartCatalog([complete]).titles[0]
    const legacy = { ...complete, smartFacets: undefined }
    const document = { ref: { path: 'users/u/tmdbCatalog/movie:10' }, data: () => ({ ...legacy, favorite: true }) }
    const shared = { ref: { path: 'users/u/sharedMedia/movie-10' }, data: () => ({ titleRef: legacy, hasMedia: true }) }
    const inventory = buildTitleCandidateInventory({ catalog: { titles: [published] }, personalDocuments: [document], movieHubDocuments: [shared], generatedAt: '2026-10-12T08:00:00Z' })
    expect(inventory.candidates[0].metadata.facetGapReferences).toBe(2)
    const preview = buildTitlePriorityPreview({ inventory })
    expect(preview.selectedKeys).toEqual(['movie:10'])
    const loadTitle = vi.fn()
    const result = await executeTitlePriorityQueue({ preview, candidateValues: new Map([['movie:10', [legacy, published]]]), loadTitle, now: new Date('2026-10-12T08:00:00Z') })
    expect(loadTitle).not.toHaveBeenCalled()
    const plan = buildCanonicalFanoutPlan({ updates: result.updates, personalDocuments: [document], movieHubDocuments: [shared] })
    const repaired = plan.firestoreWrites[0].data
    const repairedShared = plan.firestoreWrites[1].data.titleRef
    expect(repaired.facets.castPersonIds).toContain(2299)
    expect(repairedShared.facets.castPersonIds).toContain(2299)
    expect(repaired.favorite).toBe(true)
    const next = buildTitleCandidateInventory({ catalog: { titles: [published] },
      personalDocuments: [{ ...document, data: () => repaired }],
      movieHubDocuments: [{ ...shared, data: () => ({ hasMedia: true, titleRef: repairedShared }) }],
      generatedAt: '2026-10-12T08:01:00Z',
    })
    expect(next.candidates[0].metadata.facetGapReferences).toBe(0)
    expect(buildTitlePriorityPreview({ inventory: next }).selectedKeys).toEqual([])
  })
})
