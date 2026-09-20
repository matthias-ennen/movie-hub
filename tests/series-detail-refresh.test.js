import { describe, expect, it } from 'vitest'
import { selectSeriesSeasonRefreshCandidates } from '../scripts/generate-series-details.mjs'

describe('series season refresh priority', () => {
  it('refreshes TMDB-changed series before normally stale seasons', () => {
    const references = [
      { seriesTmdbId: 1, seasonNumber: 1 },
      { seriesTmdbId: 2, seasonNumber: 1 },
    ]
    const entries = new Map([
      ['1:1', { version: 1, generatedAt: '2026-07-01T00:00:00.000Z' }],
      ['2:1', { version: 1, generatedAt: '2026-09-19T00:00:00.000Z' }],
    ])

    const selected = selectSeriesSeasonRefreshCandidates(references, entries, {
      now: new Date('2026-09-20T00:00:00.000Z'),
      limit: 1,
      changedTitleKeys: new Set(['series:2']),
    })

    expect(selected).toEqual([{ seriesTmdbId: 2, seasonNumber: 1 }])
  })
})
