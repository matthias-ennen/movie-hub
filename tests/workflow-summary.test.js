import { describe, expect, it } from 'vitest'
import {
  buildWorkflowSummary,
  workflowSummaryMarkdown,
} from '../scripts/report-workflow-summary.mjs'

describe('kompakter Workflow-Datenbericht', () => {
  it('fasst die vollständige Datenpipeline in einer Tabelle zusammen', () => {
    const summary = buildWorkflowSummary({
      dataStatus: {
        catalog: { total: 1200, movies: 800, series: 400 },
        searchIndex: { total: 20000, movies: 12000, series: 8000 },
        completeSearchDetails: { total: 15000, pending: 5000 },
        seriesSeasons: { available: 3100, requested: 3200, pending: 100 },
      },
      catalog: { rowDefinitions: Array.from({ length: 14 }) },
      searchIndex: { coverage: { providerCount: 11 } },
      searchManifest: { count: 20000, bucketCount: 256 },
      seriesManifest: { refreshedCount: 600, failedCount: 3 },
      waipuIndex: {
        horizon: { start: '2026-09-19T00:00:00.000Z', endExclusive: '2026-10-03T00:00:00.000Z' },
        counts: { stations: 50, titles: 830, broadcasts: 6100 },
        metrics: {
          detailsLoaded: 4200,
          matchedPrograms: 3600,
          detailsUnavailable: 2,
          detailsMissing: 1,
          matchRejected: { no_candidate: 300, ambiguous_margin: 200, below_threshold: 100 },
        },
        runtime: { detailRequests: { cacheHits: 1200 }, tmdbRequests: 740 },
      },
      waipuSync: { metrics: { slotsProcessed: 3600, requestsStarted: 3650, slotsSkippedByCheckpoint: 600, retries: 2 } },
      metadata: { scanned: 150, candidates: 20, updated: 19, failed: 1 },
      presence: { parentGroups: 145, created: 2, repaired: 3, unresolved: 0 },
      baselineData: {
        catalog: { total: 1180 },
        searchIndex: { total: 19800 },
        completeSearchDetails: { total: 14500 },
      },
      baselineWaipu: { counts: { titles: 144 } },
      steps: {
        tmdbStrict: 'success',
        tmdbPush: 'skipped',
        waipuSync: 'success',
        waipuCatalog: 'success',
        metadata: 'success',
        presence: 'success',
        build: 'success',
        auth: 'success',
        deploy: 'success',
      },
      run: { number: 321, event: 'push', mode: 'standard', sha: 'abcdef123', reportedAt: '2026-09-19T17:00:00.000Z' },
    })

    const markdown = workflowSummaryMarkdown(summary)
    expect(summary.rows).toHaveLength(10)
    expect(markdown).toContain('Lauf #321')
    expect(markdown).toContain('| Waipu EPG | ✅ erfolgreich | 50 Sender')
    expect(markdown).toContain('3.600 zugeordnet · 740 TMDB-Suchen')
    expect(markdown).toContain('603 verworfen · 1.200 Detail-Cachetreffer')
    expect(markdown).toContain('Waipu-Titelbestand: **+686 zum Live-Stand**')
    expect(markdown.split('\n').filter((line) => line.startsWith('| '))).toHaveLength(12)
  })

  it('bleibt bei fehlenden optionalen Artefakten lesbar', () => {
    const markdown = workflowSummaryMarkdown(buildWorkflowSummary({
      steps: { build: 'failure', auth: 'failure', deploy: 'skipped' },
      run: { number: 1, reportedAt: '2026-09-19T17:00:00.000Z' },
    }))
    expect(markdown).toContain('❌ fehlgeschlagen')
    expect(markdown).toContain('| Firebase | ❌ fehlgeschlagen')
    expect(markdown).toContain('keine neue Veröffentlichung')
    expect(markdown).not.toContain('undefined')
    expect(markdown).not.toContain('NaN')
  })
})
