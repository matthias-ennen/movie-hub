import { describe, expect, it } from 'vitest'
import {
  buildTitleCandidateInventory,
  canonicalTitleIdentity,
  summarizeTitleCandidateInventory,
} from '../scripts/build-title-candidate-inventory.mjs'

function document(path, data) {
  return { ref: { path }, data: () => data }
}

describe('kanonischer Titelkandidatenbestand', () => {
  it('normalisiert die Identität ausschließlich aus Medientyp und TMDB-ID', () => {
    expect(canonicalTitleIdentity({ type: 'movie', tmdbId: 11 })).toEqual({ key: 'movie:11', type: 'movie', tmdbId: 11 })
    expect(canonicalTitleIdentity({ mediaType: 'tv', tmdbId: '22' })).toEqual({ key: 'series:22', type: 'series', tmdbId: 22 })
    expect(canonicalTitleIdentity({ type: 'series', tmdbId: 0 })).toBeNull()
    expect(canonicalTitleIdentity({ type: 'person', tmdbId: 33 })).toBeNull()
  })

  it('führt alle Katalogquellen dedupliziert zusammen und hält Search-only getrennt', () => {
    const inventory = buildTitleCandidateInventory({
      generatedAt: '2026-09-20T12:00:00.000Z',
      catalog: {
        titles: [
          { type: 'movie', tmdbId: 11 },
          { type: 'series', tmdbId: 22 },
          { type: 'movie', tmdbId: 11 },
        ],
      },
      searchIndex: {
        entries: [
          { type: 'movie', tmdbId: 11 },
          { type: 'movie', tmdbId: 33 },
          { type: 'series', tmdbId: 44 },
          { type: 'person', tmdbId: 55 },
        ],
      },
      personalDocuments: [
        document('users/u1/tmdbCatalog/movie:11', { mediaType: 'movie', tmdbId: 11 }),
        document('users/u2/tmdbCatalog/movie:33', { mediaType: 'movie', tmdbId: 33 }),
        document('not-users/u3/tmdbCatalog/movie:99', { mediaType: 'movie', tmdbId: 99 }),
      ],
      movieHubDocuments: [
        document('users/u1/sharedMedia/series-22', { hasMedia: true, titleRef: { type: 'series', tmdbId: 22 } }),
        document('users/u1/sharedMedia/movie-77', { hasMedia: false, titleRef: { type: 'movie', tmdbId: 77 } }),
      ],
      waipuTitles: { entries: [{ type: 'series', tmdbId: 66 }] },
      waipuUnresolved: {
        kind: 'waipu-unresolved-programs',
        entries: [
          { programId: 'p1', reason: 'no_candidate' },
          { programId: 'p2', reason: 'ambiguous_margin' },
        ],
      },
    })

    expect(inventory.counts).toMatchObject({
      rawCandidateReferences: 7,
      canonicalCandidates: 4,
      deduplicatedReferences: 3,
      overlappingCandidates: 2,
      searchTitles: 3,
      searchOnlyTitles: 1,
      catalogRelevantSearchTitles: 2,
      invalidSearchReferences: 1,
      byMediaType: { movie: 2, series: 2 },
    })
    expect(inventory.candidates.map(({ metadata: _metadata, ...candidate }) => candidate)).toEqual([
      { key: 'movie:11', type: 'movie', tmdbId: 11, sources: ['browse', 'personal-tmdb'] },
      { key: 'movie:33', type: 'movie', tmdbId: 33, sources: ['personal-tmdb'] },
      { key: 'series:22', type: 'series', tmdbId: 22, sources: ['browse', 'movie-hub'] },
      { key: 'series:66', type: 'series', tmdbId: 66, sources: ['waipu'] },
    ])
    expect(inventory.searchOnly).toEqual({ count: 1, keys: ['series:44'] })
    expect(inventory.sourceStats['personal-tmdb']).toMatchObject({
      rawReferences: 3,
      eligibleReferences: 2,
      rejectedReferences: 1,
      uniqueTitles: 2,
      strictCompleteReferences: 0,
      freshCompleteReferences: 0,
    })
    expect(inventory.unresolvedWaipu).toMatchObject({
      detailsAvailable: true,
      programs: 2,
      reasons: { no_candidate: 1, ambiguous_margin: 1 },
    })
  })

  it('erstellt einen veröffentlichbaren Zählbericht ohne Titel- oder persönliche Zuordnungen', () => {
    const inventory = buildTitleCandidateInventory({
      catalog: { titles: [{ type: 'movie', tmdbId: 11 }] },
      searchIndex: { entries: [{ type: 'movie', tmdbId: 12 }] },
    })
    const summary = summarizeTitleCandidateInventory(inventory)

    expect(summary.kind).toBe('title-candidate-inventory-summary')
    expect(summary).not.toHaveProperty('candidates')
    expect(summary).not.toHaveProperty('searchOnly.keys')
    expect(summary.unresolvedWaipu).not.toHaveProperty('entries')
  })

  it('kennzeichnet fehlende Waipu-Einzeldiagnosen und nutzt nur die Laufmetriken', () => {
    const inventory = buildTitleCandidateInventory({
      waipuIndex: { metrics: { matchRejected: { no_candidate: 4, below_threshold: 2 } } },
    })
    expect(inventory.unresolvedWaipu).toMatchObject({
      detailsAvailable: false,
      programs: 6,
      reasons: { no_candidate: 4, below_threshold: 2 },
      entries: [],
    })
  })
})
