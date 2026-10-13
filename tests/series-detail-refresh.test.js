import { describe, expect, it } from 'vitest'
import { collectLiveSeasonPriorities, selectSeriesSeasonRefreshCandidates } from '../scripts/generate-series-details.mjs'

describe('series season refresh priority', () => {
  it('bevorzugt tatsächlich laufende Staffeln und ignoriert abgelaufene Ausstrahlungen', () => {
    const now = new Date('2026-10-13T13:00:00Z')
    const air = (start, stop, seasonNumber) => ({ startTime: `2026-10-13T${start}:00Z`, stopTime: `2026-10-13T${stop}:00Z`, seasonNumber })
    const priorities = collectLiveSeasonPriorities([
      { type: 'series', tmdbId: 1, numberOfSeasons: 2, airings: [air('15:00', '16:00', 1)] },
      { type: 'series', tmdbId: 88971, numberOfSeasons: 6, airings: [air('12:30', '13:30', 6)] },
      { type: 'series', tmdbId: 3, numberOfSeasons: 1, airings: [air('12:00', '13:00', 1)] },
      { type: 'series', tmdbId: 4, numberOfSeasons: 2, airings: [air('12:30', '13:30', null)] },
    ], { now })
    expect(priorities.has('3:1')).toBe(false)
    expect(priorities.has('4:1')).toBe(false)
    expect(priorities.has('1:2')).toBe(false)
    const references = [{ seriesTmdbId: 1, seasonNumber: 1 }, { seriesTmdbId: 88971, seasonNumber: 6 }]
    expect(selectSeriesSeasonRefreshCandidates(references, new Map(), {
      now, limit: 1, prioritySeriesIds: new Set([1, 88971]), liveSeasonPriorities: priorities,
    })).toEqual([references[1]])
  })

  it('priorisiert bei unbekannter oder abweichender Staffel den gesamten Katalogbestand', () => {
    const title = { type: 'series', tmdbId: 902, numberOfSeasons: 2,
      airings: [{ startTime: '2026-10-13T14:00:00Z', stopTime: '2026-10-13T15:00:00Z', episodeTitle: 'Das Panzerdeck', seasonNumber: 4 }] }
    expect([...collectLiveSeasonPriorities([title], { now: Date.parse('2026-10-13T13:00:00Z') }).keys()])
      .toEqual(['902:1', '902:2'])
  })

  it('fills missing TV seasons before aged catalog entries without refetching fresh TV seasons', () => {
    const references = [1, 2, 3].map(seriesTmdbId => ({ seriesTmdbId, seasonNumber: 1 }))
    const entries = new Map([
      ['1:1', { version: 1, generatedAt: '2026-07-01T00:00:00Z' }],
      ['3:1', { version: 1, generatedAt: '2026-10-13T00:00:00Z' }],
    ])
    expect(selectSeriesSeasonRefreshCandidates(references, entries, {
      now: new Date('2026-10-13T13:00:00Z'), limit: 1, prioritySeriesIds: new Set([2, 3]),
    })).toEqual([references[1]])
  })
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
