import { describe, expect, it } from 'vitest'
import { buildDataStatus } from '../scripts/report-data-status.mjs'

describe('Datenfüllstandsbericht', () => {
  it('separates catalog, search index, complete details and season backlog', () => {
    const status = buildDataStatus({
      generatedAt: '2026-09-15T08:00:00.000Z',
      catalog: { titles: [{ type: 'movie' }, { type: 'series' }] },
      searchIndex: { entries: [{ type: 'movie' }, { type: 'movie' }, { type: 'series' }] },
      searchDetails: [
        {
          tmdbId: 1,
          type: 'movie',
          title: 'Movie',
          metadataVersion: 3,
          metadataComplete: true,
          collectionChecked: true,
          metadataChecks: {
            details: 'present', artwork: 'absent', ageRating: 'absent', credits: 'absent',
            keywords: 'absent', videos: 'absent', providers: 'absent', collection: 'absent',
          },
        },
        { tmdbId: 2, type: 'series', title: 'Incomplete', metadataComplete: false },
        {
          tmdbId: 3,
          type: 'series',
          title: 'Series',
          metadataVersion: 3,
          metadataComplete: true,
          metadataChecks: {
            details: 'present', artwork: 'absent', ageRating: 'absent', credits: 'absent',
            keywords: 'absent', videos: 'absent', providers: 'absent', seasons: 'absent',
          },
        },
      ],
      seriesManifest: {
        availableSeasonCount: 12,
        requestedSeasonCount: 15,
        pendingSeasonCount: 3,
      },
    })

    expect(status).toEqual({
      kind: 'movie-hub-data-status',
      version: 2,
      generatedAt: '2026-09-15T08:00:00.000Z',
      catalog: { total: 2, movies: 1, series: 1 },
      searchIndex: { total: 3, movies: 2, series: 1 },
      completeSearchDetails: { total: 2, pending: 1, movies: 1, series: 1 },
      seriesSeasons: { available: 12, requested: 15, pending: 3 },
    })
  })
})
