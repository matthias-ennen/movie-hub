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
        sourceDataVersion: 1,
        counts: { stations: 50, titles: 4, broadcasts: 5 },
        metadata: { complete: 4, fromCatalog: 2, fromCache: 0, fetched: 2 },
        metrics: {
          detailsLoaded: 4200,
          matchedPrograms: 3600,
          detailsUnavailable: 2,
          detailsMissing: 1,
          matchRejected: { no_candidate: 300, ambiguous_margin: 200, below_threshold: 100 },
        },
        runtime: { detailRequests: { cacheHits: 1200 }, tmdbRequests: 740, tmdbMetadataRequests: 640 },
      },
      joynIndex: {
        generatedAt: '2026-09-19T08:30:00.000Z',
        stationCount: 127,
        airingCount: 2462,
        horizon: { from: '2026-09-19T08:00:00.000Z', to: '2026-09-20T08:00:00.000Z' },
      },
      joynDiagnostic: {
        matching: { matchedPrograms: 91 },
        playback: { withRoute: 3, confirmedChannelSlug: 1, channelIdFallback: 2, withoutRoute: 0 },
      },
      joynTitles: {
        entries: [
          { type: 'movie', airings: [{ startTime: '2026-09-19T18:15:00.000Z' }] },
          { type: 'series', airings: [{ startTime: '2026-09-19T19:15:00.000Z' }, { startTime: '2026-09-20T19:15:00.000Z' }] },
        ],
      },
      waipuTitles: {
        entries: [
          {
            type: 'movie',
            airings: [{ source: 'waipu', programId: 'movie-1', stationId: 'station-1', stationName: 'Sender 1', startTime: '2026-09-19T18:00:00.000Z', stopTime: '2026-09-19T20:00:00.000Z' }],
          },
          {
            type: 'movie',
            airings: [{ source: 'waipu', programId: 'movie-2', stationId: 'station-2', stationName: 'Sender 2', startTime: '2026-09-19T20:00:00.000Z', stopTime: '2026-09-19T22:00:00.000Z' }],
          },
          {
            type: 'series',
            airings: [
              { source: 'waipu', programId: 'series-1', stationId: 'station-1', stationName: 'Sender 1', startTime: '2026-09-19T18:00:00.000Z', stopTime: '2026-09-19T19:00:00.000Z', seasonNumber: 2, episodeNumber: 4, episodeTitle: 'Die Folge' },
              { source: 'waipu', programId: 'series-2', stationId: 'station-1', stationName: 'Sender 1', startTime: '2026-09-20T18:00:00.000Z', stopTime: '2026-09-20T19:00:00.000Z' },
            ],
          },
          {
            type: 'series',
            airings: [{ source: 'waipu', programId: 'series-3', stationId: 'station-2', stationName: 'Sender 2', startTime: '2026-09-19T19:00:00.000Z', stopTime: '2026-09-19T20:00:00.000Z', episodeTitle: 'Spezial' }],
          },
        ],
      },
      waipuSync: { metrics: { slotsProcessed: 3600, requestsStarted: 3650, slotsSkippedByCheckpoint: 600, retries: 2 } },
      canonicalExecutor: {
        counts: {
          selected: 800,
          canonicalReady: 800,
          fetched: 700,
          reused: 100,
          tmdbRequests: 720,
          catalogUpdated: 450,
          searchDetailsUpdated: 620,
          waipuUpdated: 210,
          firestoreWrites: 32,
        },
      },
      candidateInventory: {
        counts: {
          rawCandidateReferences: 1900,
          canonicalCandidates: 1500,
          deduplicatedReferences: 400,
          overlappingCandidates: 300,
          searchOnlyTitles: 16308,
        },
        unresolvedWaipu: { programs: 17 },
      },
      priorityPreview: {
        inputs: { candidates: 1500 },
        counts: {
          queued: 900,
          selectedWithinCapacity: 800,
          fetchRequired: 700,
          reusableCanonical: 200,
          backlog: 100,
          duplicateQueueEntries: 0,
        },
      },
      searchRun: {
        scans: { expected: 155, completed: 155, capped: 61 },
        index: { baselineAvailable: true, addedCount: 240, removedCount: 1167, changedOfferCount: 83 },
      },
      tmdbChanges: {
        startDate: '2026-09-18',
        endDate: '2026-09-19',
        windows: [{ startDate: '2026-09-18', endDate: '2026-09-19' }],
        fetched: { movie: 27, series: 13 },
        pending: { movie: Array.from({ length: 27 }), series: Array.from({ length: 13 }) },
      },
      tmdbChangeRun: { requiredConsumers: ['catalog', 'publication'] },
      presence: { parentGroups: 145, created: 2, repaired: 3, unresolved: 0 },
      baselineData: {
        generatedAt: '2026-09-14T08:00:00.000Z',
        catalog: { total: 1180 },
        searchIndex: { total: 19800 },
        completeSearchDetails: { total: 14500 },
      },
      baselineWaipu: { counts: { titles: 3 } },
      sourceSchemaReports: [
        { summary: { breaking: 0, review: 2, info: 14 } },
        { summary: { breaking: 1, review: 0, info: 9 } },
      ],
      sourceMerge: {
        healthy: {
          sources: 2,
          broadcastEvents: 15001,
          sharedEventRoutes: ['fixture-provider', 'waipu'],
        },
        failureFallback: {
          sourceStatus: 'failed',
          retainedPrevious: true,
          activeRecords: 1,
          expiredRecordsDropped: 1,
        },
      },
      workflowTiming: {
        status: 'on-time',
        scheduledAt: '2026-09-19T01:17:00.000Z',
        actualStartAt: '2026-09-19T01:22:00.000Z',
        delayMinutes: 5,
      },
      steps: {
        tmdbChanges: 'success',
        tmdbCheckpoint: 'success',
        tmdbStrict: 'success',
        tmdbPush: 'skipped',
        waipuSync: 'success',
        waipuCatalog: 'success',
        joynCatalog: 'success',
        sourceMerge: 'success',
        canonicalExecutor: 'success',
        candidateInventory: 'success',
        priorityPreview: 'success',
        presence: 'success',
        build: 'success',
        auth: 'success',
        deploy: 'success',
      },
      run: { number: 321, event: 'push', mode: 'standard', sha: 'abcdef123', reportedAt: '2026-09-19T17:00:00.000Z' },
    })

    const markdown = workflowSummaryMarkdown(summary)
    expect(summary.rows).toHaveLength(18)
    expect(markdown).toContain('Lauf #321')
    expect(markdown).toContain('| Waipu EPG | ✅ erfolgreich | 50 Sender')
    expect(markdown).toContain('3.600 zugeordnet · 4/4 Metadaten vollständig')
    expect(markdown).toContain('603 verworfen · 740 Suchen · 640 Detailabrufe · 1.200 Waipu-Cache')
    expect(markdown).toContain('| Waipu-Quelldaten | ✅ erfolgreich | 4 Titel · 2 Filme · 2 Serien | 5/5 Ausstrahlungen vollständig · Vertrag v1 | 2/3 Serienausstrahlungen mit Episodenangabe |')
    expect(markdown).toContain('| Joyn EPG | ✅ erfolgreich | 127 Sender · 2 Titel · 3 Ausstrahlungen | 1 Filme · 1 Serien · 91 Programme TMDB-zugeordnet | 3 mit Ziel · 1 Sender-Slug · 2 channel_id-Fallback · 0 ohne Ziel |')
    expect(markdown).toContain('| Quellen-Schema | 🔴 BREAKING erkannt | 2 Berichte · 23 bekannte/Info-Felder | 2 Review · 1 Breaking |')
    expect(markdown).toContain('| Quellen-Merge | ✅ Merge + Fehlerisolation | 2 Quellen · 15.001 neutrale Events | gemeinsame Routen: fixture-provider + waipu | Fallback: failed · 1 aktiv · 1 abgelaufen entfernt |')
    expect(markdown).toContain('Waipu-Titelbestand: **+1 zum Live-Stand**')
    expect(markdown).toContain('| TMDB-Änderungen | ✅ erfolgreich | 27 Filme · 13 Serien neu gemeldet')
    expect(markdown).toContain('| Suchindex | ✅ erfolgreich | 20.000 · 12.000 Filme · 8.000 Serien | +240 hinzu · -1.167 entfallen · 83 Angebote geändert | 155/155 Scans · 61 begrenzt · 256 Shards |')
    expect(markdown).toContain('| Kanonischer Executor | ✅ erfolgreich | 800/800 kanonisch verarbeitet | 700 TMDB geladen · 100 wiederverwendet · 720 Requests | 450 Browse · 620 Suche · 210 Waipu · 32 persönlich verteilt |')
    expect(markdown).toContain('| Kanonische Titelkandidaten | ✅ erfolgreich | 1.500 Titel aus 1.900 Referenzen | 400 Dubletten entfernt · 300 Mehrfachzuordnungen | 16.308 nur Suche · 17 Waipu ungeklärt |')
    expect(markdown).toContain('| Prioritätsvorschau | ✅ erfolgreich | 900/1.500 eingeplant · 800 in Tageskapazität | 700 TMDB-Abrufe · 200 Wiederverwendungen | 100 Rückstand · 0 Queue-Dubletten |')
    expect(markdown).toContain('| Laufüberwachung | ✅ pünktlich gestartet | geplant 19.9.2026, 03:17:00 | tatsächlich 19.9.2026, 03:22:00 · 5 Minuten Verzögerung | vorheriger Datenstand beim Start 4 Tage 17 Stunden alt |')
    expect(markdown.split('\n').filter((line) => line.startsWith('| '))).toHaveLength(20)
  })

  it('bleibt bei fehlenden optionalen Artefakten lesbar', () => {
    const markdown = workflowSummaryMarkdown(buildWorkflowSummary({
      steps: { build: 'failure', auth: 'failure', deploy: 'skipped' },
      run: { number: 1, reportedAt: '2026-09-19T17:00:00.000Z' },
    }))
    expect(markdown).toContain('❌ fehlgeschlagen')
    expect(markdown).toContain('| Firebase | ❌ fehlgeschlagen')
    expect(markdown).toContain('keine neue Veröffentlichung')
    expect(markdown).toContain('| Waipu-Quelldaten | ⏭️ unverändert | 0 Titel · Aufteilung nicht verfügbar | Quelldatenprüfung nicht verfügbar · Vertrag v0 | Episodenangaben nicht verfügbar |')
    expect(markdown).not.toContain('undefined')
    expect(markdown).not.toContain('NaN')
  })
})
