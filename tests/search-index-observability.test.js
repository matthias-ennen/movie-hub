import { describe, expect, it } from 'vitest'
import {
  buildSearchIndexDiff,
  buildSearchIndexRunReport,
  evaluateSearchIndexRunReport,
} from '../scripts/search-index-observability.mjs'

function title(type, tmdbId, providerId = 'netflix', offerTypes = ['flatrate']) {
  return {
    id: `tmdb-${type}-${tmdbId}`,
    type,
    tmdbId,
    title: `${type} ${tmdbId}`,
    providerOffers: [{ id: providerId, tmdbProviderId: 8, offerTypes }],
  }
}

describe('Suchindex-Herkunftsnachweis', () => {
  it('reports additions, removals and changed provider offers by canonical title identity', () => {
    const diff = buildSearchIndexDiff(
      [title('movie', 1), title('series', 2), title('movie', 3, 'prime', ['rent'])],
      [title('movie', 1), title('movie', 3, 'prime', ['buy']), title('series', 4)],
    )

    expect(diff.added.map(({ key }) => key)).toEqual(['series:4'])
    expect(diff.removed.map(({ key }) => key)).toEqual(['series:2'])
    expect(diff.changedOffers).toEqual([
      expect.objectContaining({ key: 'movie:3', before: [expect.objectContaining({ offerTypes: ['rent'] })], after: [expect.objectContaining({ offerTypes: ['buy'] })] }),
    ])
    expect(diff.providerOfferDeltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'series:netflix:flatrate', addedTitles: 1, removedTitles: 1 }),
      expect.objectContaining({ key: 'movie:prime:rent', addedTitles: 0, removedTitles: 1 }),
      expect.objectContaining({ key: 'movie:prime:buy', addedTitles: 1, removedTitles: 0 }),
    ]))
  })

  it('summarizes every scan and the previous-to-current index delta', () => {
    const report = buildSearchIndexRunReport({
      generatedAt: '2026-09-20T15:00:00.000Z',
      scans: [
        { key: 'netflix:movie:flatrate', status: 'complete', pagesFetched: 50, rawResults: 1000, capped: true, skippedResults: 0 },
        { key: 'netflix:series:flatrate', status: 'complete', pagesFetched: 12, rawResults: 231, capped: false, skippedResults: 1 },
      ],
      previousIndex: { generatedAt: '2026-09-19T15:00:00.000Z', entries: [title('movie', 1), title('series', 2)] },
      currentIndex: { generatedAt: '2026-09-20T15:00:00.000Z', entries: [title('movie', 1), title('movie', 3)] },
      broadEntries: [title('movie', 1), title('movie', 3)],
    })

    expect(report).toMatchObject({
      kind: 'search-index-run-report',
      scans: {
        expected: 2,
        completed: 2,
        capped: 1,
        withSkippedResults: 1,
        pagesFetched: 62,
        rawResults: 1231,
        broadUniqueTitles: 2,
      },
      index: {
        baselineAvailable: true,
        previous: { total: 2, movie: 1, series: 1 },
        current: { total: 2, movie: 2, series: 0 },
        delta: { total: 0, movie: 1, series: -1 },
        addedCount: 1,
        removedCount: 1,
        changedOfferCount: 0,
      },
    })
  })

  it('allows measured market churn while the complete index remains stable', () => {
    const report = buildSearchIndexRunReport({
      scans: Array.from({ length: 155 }, (_, index) => ({
        key: `scan:${index}`,
        status: 'complete',
        pagesFetched: 1,
        rawResults: 20,
        skippedResults: 0,
      })),
      previousIndex: { entries: Array.from({ length: 1000 }, (_, index) => title(index < 600 ? 'movie' : 'series', index + 1)) },
      currentIndex: { entries: Array.from({ length: 950 }, (_, index) => title(index < 570 ? 'movie' : 'series', index + 1)) },
    })

    expect(evaluateSearchIndexRunReport(report)).toMatchObject({
      passed: true,
      metrics: { totalDropRatio: 0.05, movieDropRatio: 0.05, seriesDropRatio: 0.05 },
      reasons: [],
    })
  })

  it('blocks missing baselines, incomplete scan sets and implausible media loss', () => {
    const withoutBaseline = buildSearchIndexRunReport({
      scans: [{ status: 'complete', rawResults: 10, skippedResults: 0 }],
      currentIndex: { entries: [title('movie', 1)] },
    })
    expect(evaluateSearchIndexRunReport(withoutBaseline)).toMatchObject({ passed: false })

    const report = buildSearchIndexRunReport({
      scans: Array.from({ length: 154 }, (_, index) => ({
        key: `scan:${index}`,
        status: index === 0 ? 'incomplete' : 'complete',
        rawResults: 20,
        skippedResults: index === 1 ? 5 : 0,
      })),
      previousIndex: { entries: Array.from({ length: 1000 }, (_, index) => title(index < 500 ? 'movie' : 'series', index + 1)) },
      currentIndex: { entries: Array.from({ length: 800 }, (_, index) => title(index < 450 ? 'movie' : 'series', index + 1)) },
    })
    const quality = evaluateSearchIndexRunReport(report)

    expect(quality.passed).toBe(false)
    expect(quality.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('154 scans were scheduled'),
      expect.stringContaining('153/154 scans completed'),
      expect.stringContaining('Skipped-result ratio'),
      expect.stringContaining('Total index drop 20.00%'),
      expect.stringContaining('Series index drop 30.00%'),
    ]))
  })
})
