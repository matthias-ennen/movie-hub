import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function integer(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

function countTypes(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((counts, entry) => {
    if (entry?.type === 'movie') counts.movies += 1
    if (entry?.type === 'series') counts.series += 1
    return counts
  }, { movies: 0, series: 0 })
}

function number(value) {
  return integer(value).toLocaleString('de-DE')
}

function difference(current, previous) {
  if (previous === null || previous === undefined) return 'kein Vergleich'
  const delta = integer(current) - integer(previous)
  if (delta === 0) return '±0 zum Live-Stand'
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('de-DE')} zum Live-Stand`
}

function outcome(value, skipped = '⏭️ unverändert') {
  if (value === 'success') return '✅ erfolgreich'
  if (value === 'failure') return '❌ fehlgeschlagen'
  if (value === 'cancelled') return '⛔ abgebrochen'
  if (value === 'skipped' || !value) return skipped
  return `🟡 ${value}`
}

function combinedOutcome(...values) {
  if (values.includes('failure')) return 'failure'
  if (values.includes('cancelled')) return 'cancelled'
  if (values.includes('success')) return 'success'
  return values.find(Boolean) || 'skipped'
}

function rejectedMatches(metrics = {}) {
  return Object.values(metrics.matchRejected || {}).reduce((sum, value) => sum + integer(value), 0)
}

export function buildWorkflowSummary({
  dataStatus = {},
  catalog = {},
  searchIndex = {},
  searchManifest = {},
  seriesManifest = {},
  waipuIndex = {},
  waipuSync = {},
  waipuDetail = {},
  presence = {},
  metadata = {},
  personalMetadata = {},
  tmdbChanges = {},
  tmdbChangeRun = {},
  baselineData = null,
  baselineWaipu = null,
  steps = {},
  run = {},
} = {}) {
  const catalogTypes = dataStatus.catalog || countTypes(catalog.titles)
  const searchTypes = dataStatus.searchIndex || countTypes(searchIndex.entries)
  const completeDetails = dataStatus.completeSearchDetails || {}
  const seasons = dataStatus.seriesSeasons || {}
  const waipuMetrics = waipuIndex.metrics || {}
  const waipuCounts = waipuIndex.counts || {}
  const detailRequests = waipuIndex.runtime?.detailRequests || waipuDetail.metrics || {}
  const tmdbRequests = integer(waipuIndex.runtime?.tmdbRequests)
  const waipuMetadata = waipuIndex.metadata || {}
  const tmdbMetadataRequests = integer(waipuIndex.runtime?.tmdbMetadataRequests)
  const matchRejected = rejectedMatches(waipuMetrics)
  const detailRejected = integer(waipuMetrics.detailsUnavailable) + integer(waipuMetrics.detailsMissing)
  const tmdbOutcome = combinedOutcome(steps.tmdbStrict, steps.tmdbPush)

  return {
    run: {
      number: String(run.number || '–'),
      event: String(run.event || 'unbekannt'),
      mode: String(run.mode || 'standard'),
      sha: String(run.sha || '').slice(0, 7) || '–',
      reportedAt: run.reportedAt || new Date().toISOString(),
    },
    rows: [
      {
        area: 'TMDB-Änderungen',
        status: outcome(combinedOutcome(steps.tmdbChanges, steps.tmdbCheckpoint)),
        stock: `${number(tmdbChanges.fetched?.movie)} Filme · ${number(tmdbChanges.fetched?.series)} Serien neu gemeldet`,
        activity: `${tmdbChanges.startDate || '–'} bis ${tmdbChanges.endDate || '–'} · ${number(tmdbChanges.windows?.length)} Fenster`,
        open: steps.tmdbCheckpoint === 'success'
          ? `Checkpoint ${tmdbChanges.endDate || '–'} bestätigt`
          : `${number(tmdbChanges.pending?.movie?.length + tmdbChanges.pending?.series?.length)} offen · ${number(tmdbChangeRun.requiredConsumers?.length)} Bestätigungen erforderlich`,
      },
      {
        area: 'TMDB Browse-Katalog',
        status: outcome(tmdbOutcome),
        stock: `${number(catalogTypes.total)} · ${number(catalogTypes.movies)} Filme · ${number(catalogTypes.series)} Serien`,
        activity: difference(catalogTypes.total, baselineData?.catalog?.total),
        open: `${integer(catalog.rowDefinitions?.length)} Reihen`,
      },
      {
        area: 'Suchindex',
        status: outcome(tmdbOutcome),
        stock: `${number(searchTypes.total)} · ${number(searchTypes.movies)} Filme · ${number(searchTypes.series)} Serien`,
        activity: `${difference(searchTypes.total, baselineData?.searchIndex?.total)} · ${integer(searchIndex.coverage?.providerCount)} Anbieter`,
        open: `${integer(searchManifest.bucketCount)} Shards`,
      },
      {
        area: 'Suchdetails',
        status: outcome(tmdbOutcome),
        stock: `${number(completeDetails.total)}/${number(searchManifest.count)} vollständig`,
        activity: difference(completeDetails.total, baselineData?.completeSearchDetails?.total),
        open: `${number(completeDetails.pending)} offen`,
      },
      {
        area: 'Serienstaffeln',
        status: outcome(tmdbOutcome),
        stock: `${number(seasons.available)}/${number(seasons.requested)} verfügbar`,
        activity: `${number(seriesManifest.refreshedCount)} aktualisiert`,
        open: `${number(seasons.pending)} offen · ${number(seriesManifest.failedCount)} Fehler`,
      },
      {
        area: 'Waipu EPG',
        status: outcome(steps.waipuSync),
        stock: `${number(waipuCounts.stations || waipuSync.stations?.length)} Sender · ${waipuIndex.horizon?.start?.slice(0, 10) || '–'} bis ${waipuIndex.horizon?.endExclusive?.slice(0, 10) || '–'}`,
        activity: `${number(waipuSync.metrics?.slotsProcessed)} Slots · ${number(waipuSync.metrics?.requestsStarted)} Requests`,
        open: `${number(waipuSync.metrics?.slotsSkippedByCheckpoint)} aus Cache · ${number(waipuSync.metrics?.retries)} Retries`,
      },
      {
        area: 'Waipu → TMDB',
        status: outcome(steps.waipuCatalog),
        stock: `${number(waipuCounts.titles)} Titel · ${number(waipuCounts.broadcasts)} Ausstrahlungen`,
        activity: `${number(waipuMetrics.matchedPrograms)} zugeordnet · ${number(waipuMetadata.complete)}/${number(waipuCounts.titles)} Metadaten vollständig`,
        open: `${number(matchRejected + detailRejected)} verworfen · ${number(tmdbRequests)} Suchen · ${number(tmdbMetadataRequests)} Detailabrufe · ${number(detailRequests.cacheHits)} Waipu-Cache`,
      },
      {
        area: 'Movie-Hub-Metadaten',
        status: outcome(steps.metadata),
        stock: `${number(metadata.scanned)} geprüft · ${number(metadata.candidates)} ausgewählt`,
        activity: `${number(metadata.updated)} aktualisiert`,
        open: `${number(metadata.failed)} Fehler`,
      },
      {
        area: 'Persönliche TMDB-Metadaten',
        status: outcome(steps.personalMetadata),
        stock: `${number(personalMetadata.scanned)} geprüft · ${number(personalMetadata.candidates)} ausgewählt`,
        activity: `${number(personalMetadata.updated)} aktualisiert`,
        open: `${number(personalMetadata.failed)} Fehler`,
      },
      {
        area: 'Bestandsmigration',
        status: outcome(steps.presence),
        stock: `${number(presence.parentGroups)} Movie-Hub-Titel`,
        activity: `${number(presence.created)} angelegt · ${number(presence.repaired)} repariert`,
        open: `${number(presence.unresolved)} ungeklärt`,
      },
      {
        area: 'App-Build',
        status: outcome(steps.build),
        stock: 'Web-App und öffentliche Daten',
        activity: 'Produktions-Build',
        open: '–',
      },
      {
        area: 'Firebase',
        status: outcome(combinedOutcome(steps.auth, steps.deploy), '⏭️ nicht veröffentlicht'),
        stock: 'Hosting und Firestore-Regeln',
        activity: steps.deploy === 'success' ? 'gemeinsam veröffentlicht' : 'keine neue Veröffentlichung',
        open: steps.deploy === 'failure' ? 'letzter gültiger Stand bleibt online' : '–',
      },
    ],
    waipuDelta: difference(waipuCounts.titles, baselineWaipu?.counts?.titles),
  }
}

export function workflowSummaryMarkdown(summary) {
  const header = `Lauf #${summary.run.number} · ${summary.run.event} · ${summary.run.mode} · \`${summary.run.sha}\` · Bericht ${new Date(summary.run.reportedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`
  return [
    '## Movie Hub · kompakter Datenlauf-Bericht',
    '',
    header,
    '',
    '| Datenbereich | Status | Bestand / Umfang | In diesem Lauf | Offen / verworfen |',
    '| --- | --- | --- | --- | --- |',
    ...summary.rows.map((row) => `| ${row.area} | ${row.status} | ${row.stock} | ${row.activity} | ${row.open} |`),
    '',
    `Waipu-Titelbestand: **${summary.waipuDelta}**. TMDB bleibt Metadatenquelle; Waipu ergänzt Sender und Ausstrahlungszeiten.`,
    '',
  ].join('\n')
}

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch {
    return fallback
  }
}

async function main() {
  const [dataStatus, catalog, searchIndex, searchManifest, seriesManifest, waipuIndex, waipuSync, waipuDetail, presence, metadata, personalMetadata, tmdbChanges, activeTmdbChangeRun, lastTmdbChangeRun, baselineData, baselineWaipu] = await Promise.all([
    readJson('public/data-status.json'),
    readJson('public/catalog.json'),
    readJson('public/search-index.json'),
    readJson('public/search-details/manifest.json'),
    readJson('public/series-details/manifest.json'),
    readJson('public/waipu-live/index.json'),
    readJson('artifacts/waipu-sync/status.json'),
    readJson('artifacts/waipu-live/detail-status.json'),
    readJson('artifacts/moviehub-presence-status.json'),
    readJson('artifacts/moviehub-metadata-status.json'),
    readJson('artifacts/personal-tmdb-metadata-status.json'),
    readJson('artifacts/tmdb-data/change-set.json'),
    readJson('artifacts/tmdb-data/run.json', null),
    readJson('artifacts/tmdb-data/last-run.json', null),
    readJson('artifacts/workflow-baseline/data-status.json', null),
    readJson('artifacts/workflow-baseline/waipu-index.json', null),
  ])
  const summary = buildWorkflowSummary({
    dataStatus, catalog, searchIndex, searchManifest, seriesManifest, waipuIndex, waipuSync, waipuDetail, presence, metadata, personalMetadata, tmdbChanges,
    tmdbChangeRun: activeTmdbChangeRun || lastTmdbChangeRun || {}, baselineData, baselineWaipu,
    steps: {
      tmdbChanges: process.env.SUMMARY_TMDB_CHANGES,
      tmdbCheckpoint: process.env.SUMMARY_TMDB_CHECKPOINT,
      tmdbStrict: process.env.SUMMARY_TMDB_STRICT,
      tmdbPush: process.env.SUMMARY_TMDB_PUSH,
      waipuSync: process.env.SUMMARY_WAIPU_SYNC,
      waipuCatalog: process.env.SUMMARY_WAIPU_CATALOG,
      metadata: process.env.SUMMARY_METADATA,
      personalMetadata: process.env.SUMMARY_PERSONAL_TMDB,
      presence: process.env.SUMMARY_PRESENCE,
      build: process.env.SUMMARY_BUILD,
      auth: process.env.SUMMARY_AUTH,
      deploy: process.env.SUMMARY_DEPLOY,
    },
    run: {
      number: process.env.GITHUB_RUN_NUMBER,
      event: process.env.GITHUB_EVENT_NAME,
      mode: process.env.SUMMARY_DATA_MODE,
      sha: process.env.GITHUB_SHA,
      reportedAt: new Date().toISOString(),
    },
  })
  const markdown = workflowSummaryMarkdown(summary)
  console.log(markdown)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
