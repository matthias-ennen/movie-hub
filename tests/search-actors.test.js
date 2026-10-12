import { describe, expect, it } from 'vitest'
import { buildActorSearchIndex, projectSearchActors } from '../src/search/searchActors.js'
import { buildSearchIndexArtifact, buildSearchIndexEntries, searchIndex } from '../src/search/searchIndex.js'
import { buildSearchCatalog } from '../src/search/searchCatalog.js'
import { createTitleSnapshot } from '../src/library/libraryState.js'
import { mergeCatalogWithPersonalSnapshots } from '../src/library/personalRows.js'

const josh = { id: 2299, name: 'Josh Hartnett' }
const movie = (tmdbId, title, extra = {}) => ({
  id: `tmdb-movie-${tmdbId}`, tmdbId, type: 'movie', title, providerIds: ['prime'],
  smartFacets: { cast: [josh] }, ...extra,
})
const find = (catalog, query, options = {}) => searchIndex(catalog.entries, query, {
  actorIndex: buildActorSearchIndex(catalog.entries, catalog.actors), ...options,
})

describe('Schauspielersuche auf gemeinsamer Titelbasis', () => {
  it('finds the complete cast through IDs and a single directory, without display-cast limits', () => {
    const cast = Array.from({ length: 25 }, (_, id) => ({ id: id + 1, name: `Person ${id + 1}` }))
    const fullTitle = movie(4513, '30 Days of Night', { smartFacets: { cast: [...cast, josh] }, cast: cast.slice(0, 20) })
    const artifact = buildSearchIndexArtifact({ titles: [fullTitle] })
    expect(find(artifact, '  JoSH   Hartnett  ').results.map((entry) => entry.tmdbId)).toEqual([4513])
    expect(find(artifact, 'Hartn').total).toBe(1)
    expect(artifact.entries[0].castPersonIds).toHaveLength(26)
    expect(artifact.entries[0]).not.toHaveProperty('cast')
    expect(artifact.entries[0].searchText).not.toContain('hartnett')
    expect(artifact.actors.find((person) => person.id === josh.id)).toEqual(josh)
  })

  it('projects existing broad detail metadata without adding titles or changing provider offers', () => {
    const detail = movie(4513, '30 Days of Night')
    const oldIndex = { kind: 'search-index', version: 1, generatedAt: 'old', entries: buildSearchIndexEntries([
      movie(4513, '30 Days of Night', { smartFacets: null }),
      movie(9, 'Other', { smartFacets: null }),
    ]) }
    const artifact = projectSearchActors(oldIndex, [detail, movie(100, 'Not in search')])
    expect(find(artifact, 'josh').results.map((entry) => entry.tmdbId)).toEqual([4513])
    expect(artifact.entries).toHaveLength(2)
    expect(artifact.generatedAt).toBe('old')
    expect(artifact.entries[0].providerIds).toEqual(['prime'])
    expect(artifact.actorCoverage).toEqual({ titles: 1, total: 2 })
    expect(artifact.actors).toEqual([josh])
  })

  it('uses full published facets with directory names, handles accents and keeps title matches first', () => {
    const actor = { id: 5, label: 'Léa Seydoux' }
    const artifact = buildSearchIndexArtifact({
      smartFilterOptions: { cast: [actor] },
      titles: [
        movie(1, 'A movie', { facets: { castPersonIds: [5] }, smartFacets: null }),
        movie(2, 'Léa Seydoux', { smartFacets: null }),
      ],
    })
    expect(find(artifact, 'lea seydoux').results.map((entry) => entry.tmdbId)).toEqual([2, 1])
    expect(find(artifact, 'a').total).toBe(0)
    expect(find(artifact, 'does not exist').total).toBe(0)
  })

  it('merges remote, personal, own and profile-only titles with canonical deduplication and provider rules', () => {
    const publicTitle = movie(1, 'Public')
    const personalTitle = movie(2, 'Personal', { providerIds: [] })
    const ownTitle = movie(3, 'Own', { providerIds: ['moviehub'] })
    const snapshot = createTitleSnapshot(movie(4513, '30 Days of Night', { providerIds: [] }))
    const statesByKey = { 'movie-4513': { favorite: true, titleSnapshot: snapshot } }
    const metadataTitles = mergeCatalogWithPersonalSnapshots([
      publicTitle, personalTitle, ownTitle,
      movie(1, 'Alias', { id: 'local-alias' }),
      movie(1, 'Series', { id: 'tmdb-series-1', type: 'series' }),
    ], statesByKey)
    const catalog = buildSearchCatalog({
      remoteIndex: buildSearchIndexArtifact({ titles: [publicTitle] }),
      metadataTitles, personalTitles: [personalTitle], statesByKey,
    })
    expect(find(catalog, 'josh').total).toBe(5)
    expect(find(catalog, 'josh', { enabledProviderIds: [] }).results.map((entry) => entry.tmdbId).sort()).toEqual([2, 4513])
    expect(find(catalog, 'josh', { enabledProviderIds: ['moviehub'] }).total).toBe(3)
    expect(catalog.entries.find((entry) => entry.id === publicTitle.id).title).toBe('Public')
    expect(find(catalog, '30 days').total).toBe(1)

    const nextProfile = buildSearchCatalog({ metadataTitles: [publicTitle, personalTitle, ownTitle], personalTitles: [personalTitle] })
    expect(find(nextProfile, 'josh', { enabledProviderIds: [] }).total).toBe(1)
    expect(find(nextProfile, '30 days').total).toBe(0)
  })

  it('keeps local actor search working with a legacy index or unavailable remote index', () => {
    const metadataTitles = [movie(4513, '30 Days of Night')]
    for (const remoteIndex of [null, { entries: [{ ...buildSearchIndexEntries(metadataTitles)[0], castPersonIds: undefined }] }]) {
      const catalog = buildSearchCatalog({ metadataTitles, remoteIndex })
      expect(find(catalog, 'hartnett').total).toBe(1)
    }
  })

  it('counts a title once when multiple cast members match and applies the limit afterwards', () => {
    const titles = Array.from({ length: 75 }, (_, id) => movie(id + 1, `Film ${id}`, {
      smartFacets: { cast: [josh, { id: 9, name: 'Josh Other' }] },
    }))
    const result = find(buildSearchIndexArtifact({ titles }), 'josh')
    expect(result.total).toBe(75)
    expect(result.results).toHaveLength(60)
    expect(result.hasMore).toBe(true)
  })

  it('clears removed cast on reprojection and reports metadata gaps without guessing', () => {
    const original = buildSearchIndexArtifact({ titles: [movie(1, 'First')] })
    const empty = projectSearchActors(original, [movie(1, 'First', { smartFacets: { cast: [] } })])
    expect(find(empty, 'josh').total).toBe(0)
    expect(empty.actors).toEqual([])
    const renamed = projectSearchActors(original, [movie(1, 'First', { smartFacets: { cast: [{ id: josh.id, name: 'Updated Name' }] } })])
    expect(find(renamed, 'updated name').total).toBe(1)
    expect(find(renamed, 'josh').total).toBe(0)
    const gap = buildSearchIndexArtifact({ titles: [movie(2, 'Unknown', {
      smartFacets: null, facets: { castPersonIds: [100, null, -1, 'bad'] },
    })] })
    expect(gap.entries[0].castPersonIds).toEqual([100])
    expect(gap.actorCoverage).toEqual({ titles: 0, total: 1 })
  })
})
