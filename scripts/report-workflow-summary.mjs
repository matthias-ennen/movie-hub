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

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function waipuSourceCoverage(titles = {}) {
  const entriesAvailable = Array.isArray(titles?.entries)
  const entries = entriesAvailable ? titles.entries : []
  const types = countTypes(entries)
  const airings = entries.flatMap((entry) => (
    Array.isArray(entry?.airings) ? entry.airings.map((airing) => ({ airing, type: entry?.type })) : []
  ))
  const seriesAirings = airings.filter(({ type }) => type === 'series')
  const complete = airings.filter(({ airing }) => (
    airing?.source === 'waipu'
    && hasValue(airing?.programId)
    && hasValue(airing?.stationId)
    && hasValue(airing?.stationName)
    && hasValue(airing?.startTime)
    && hasValue(airing?.stopTime)
  )).length
  const withEpisodeData = seriesAirings.filter(({ airing }) => (
    hasValue(airing?.episodeTitle)
    || hasValue(airing?.seasonNumber)
    || hasValue(airing?.episodeNumber)
  )).length

  return {
    available: entriesAvailable,
    types,
    total: airings.length,
    complete,
    seriesTotal: seriesAirings.length,
    withEpisodeData,
  }
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

function timestamp(value) {
  if (!value) return '–'
  return new Date(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
}

function age(value, comparedAt) {
  const start = Date.parse(value)
  const end = Date.parse(comparedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'unbekannt'
  const hours = Math.floor((end - start) / 3_600_000)
  return hours < 24 ? `${hours} Stunden` : `${Math.floor(hours / 24)} Tage ${hours % 24} Stunden`
}

export function buildWorkflowSummary({
  dataStatus = {},
  catalog = {},
  searchIndex = {},
  searchManifest = {},
  seriesManifest = {},
  waipuIndex = {},
  waipuTitles = {},
  waipuSync = {},
  waipuDetail = {},
  presence = {},
  canonicalExecutor = {},
  candidateInventory = {},
  priorityPreview = {},
  searchRun = {},
  tmdbChanges = {},
  tmdbChangeRun = {},
  baselineData = null,
  baselineWaipu = null,
  workflowTiming = {},
  steps = {},
  run = {},
} = {}) {
  const catalogTypes = dataStatus.catalog || countTypes(catalog.titles)
  const searchTypes = dataStatus.searchIndex || countTypes(searchIndex.entries)
  const completeDetails = dataStatus.completeSearchDetails || {}
  const seasons = dataStatus.seriesSeasons || {}
  const waipuMetrics = waipuIndex.metrics || {}
  const waipuCounts = waipuIndex.counts || {}
  const waipuSources = waipuSourceCoverage(waipuTitles)
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
        area: 'Laufüberwachung',
        status: workflowTiming.status === 'delayed'
          ? '🟡 verspätet'
          : workflowTiming.status === 'on-time'
            ? '✅ pünktlich gestartet'
            : 'ℹ️ manueller/Code-Lauf',
        stock: workflowTiming.scheduledAt
          ? `geplant ${timestamp(workflowTiming.scheduledAt)}`
          : `Start ${timestamp(workflowTiming.actualStartAt)}`,
        activity: Number.isFinite(workflowTiming.delayMinutes)
          ? `tatsächlich ${timestamp(workflowTiming.actualStartAt)} · ${workflowTiming.delayMinutes} Minuten Verzögerung`
          : 'keine planmäßige Startzeit',
        open: baselineData?.generatedAt
          ? `vorheriger Datenstand beim Start ${age(baselineData.generatedAt, workflowTiming.actualStartAt || run.reportedAt)} alt`
          : 'Alter des vorherigen Datenstands unbekannt',
      },
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
        activity: searchRun.index?.baselineAvailable
          ? `+${number(searchRun.index?.addedCount)} hinzu · -${number(searchRun.index?.removedCount)} entfallen · ${number(searchRun.index?.changedOfferCount)} Angebote geändert`
          : `${difference(searchTypes.total, baselineData?.searchIndex?.total)} · ${integer(searchIndex.coverage?.providerCount)} Anbieter`,
        open: `${number(searchRun.scans?.completed)}/${number(searchRun.scans?.expected)} Scans · ${number(searchRun.scans?.capped)} begrenzt · ${integer(searchManifest.bucketCount)} Shards`,
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
        area: 'Waipu-Quelldaten',
        status: outcome(steps.waipuCatalog),
        stock: waipuSources.available
          ? `${number(waipuCounts.titles)} Titel · ${number(waipuSources.types.movies)} Filme · ${number(waipuSources.types.series)} Serien`
          : `${number(waipuCounts.titles)} Titel · Aufteilung nicht verfügbar`,
        activity: waipuSources.available
          ? `${number(waipuSources.complete)}/${number(waipuSources.total)} Ausstrahlungen vollständig · Vertrag v${integer(waipuIndex.sourceDataVersion)}`
          : `Quelldatenprüfung nicht verfügbar · Vertrag v${integer(waipuIndex.sourceDataVersion)}`,
        open: waipuSources.available
          ? `${number(waipuSources.withEpisodeData)}/${number(waipuSources.seriesTotal)} Serienausstrahlungen mit Episodenangabe`
          : 'Episodenangaben nicht verfügbar',
      },
      {
        area: 'Kanonische Titelkandidaten',
        status: outcome(steps.candidateInventory, '⏭️ noch nicht inventarisiert'),
        stock: `${number(candidateInventory.counts?.canonicalCandidates)} Titel aus ${number(candidateInventory.counts?.rawCandidateReferences)} Referenzen`,
        activity: `${number(candidateInventory.counts?.deduplicatedReferences)} Dubletten entfernt · ${number(candidateInventory.counts?.overlappingCandidates)} Mehrfachzuordnungen`,
        open: `${number(candidateInventory.counts?.searchOnlyTitles)} nur Suche · ${number(candidateInventory.unresolvedWaipu?.programs)} Waipu ungeklärt`,
      },
      {
        area: 'Prioritätsvorschau',
        status: outcome(steps.priorityPreview, '⏭️ noch nicht berechnet'),
        stock: `${number(priorityPreview.counts?.queued)}/${number(priorityPreview.inputs?.candidates)} eingeplant · ${number(priorityPreview.counts?.selectedWithinCapacity)} in Tageskapazität`,
        activity: `${number(priorityPreview.counts?.fetchRequired)} TMDB-Abrufe · ${number(priorityPreview.counts?.reusableCanonical)} Wiederverwendungen`,
        open: `${number(priorityPreview.counts?.backlog)} Rückstand · ${number(priorityPreview.counts?.duplicateQueueEntries)} Queue-Dubletten`,
      },
      {
        area: 'Kanonischer Executor',
        status: outcome(steps.canonicalExecutor, '⏭️ bei Code-Deploy unverändert'),
        stock: `${number(canonicalExecutor.counts?.canonicalReady)}/${number(canonicalExecutor.counts?.selected)} kanonisch verarbeitet`,
        activity: `${number(canonicalExecutor.counts?.fetched)} TMDB geladen · ${number(canonicalExecutor.counts?.reused)} wiederverwendet · ${number(canonicalExecutor.counts?.tmdbRequests)} Requests`,
        open: `${number(canonicalExecutor.counts?.catalogUpdated)} Browse · ${number(canonicalExecutor.counts?.searchDetailsUpdated)} Suche · ${number(canonicalExecutor.counts?.waipuUpdated)} Waipu · ${number(canonicalExecutor.counts?.firestoreWrites)} persönlich verteilt`,
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
  const [dataStatus, catalog, searchIndex, searchManifest, seriesManifest, waipuIndex, waipuTitles, waipuSync, waipuDetail, presence, canonicalExecutor, candidateInventory, priorityPreview, searchRun, tmdbChanges, activeTmdbChangeRun, lastTmdbChangeRun, baselineData, baselineWaipu, workflowTiming] = await Promise.all([
    readJson('public/data-status.json'),
    readJson('public/catalog.json'),
    readJson('public/search-index.json'),
    readJson('public/search-details/manifest.json'),
    readJson('public/series-details/manifest.json'),
    readJson('public/waipu-live/index.json'),
    readJson('public/waipu-live/titles.json'),
    readJson('artifacts/waipu-sync/status.json'),
    readJson('artifacts/waipu-live/detail-status.json'),
    readJson('artifacts/moviehub-presence-status.json'),
    readJson('artifacts/title-canonical-executor-summary.json'),
    readJson('artifacts/title-candidate-inventory-summary.json'),
    readJson('artifacts/title-priority-preview-summary.json'),
    readJson('artifacts/search-index-run-report.json'),
    readJson('artifacts/tmdb-data/change-set.json'),
    readJson('artifacts/tmdb-data/run.json', null),
    readJson('artifacts/tmdb-data/last-run.json', null),
    readJson('artifacts/workflow-baseline/data-status.json', null),
    readJson('artifacts/workflow-baseline/waipu-index.json', null),
    readJson('artifacts/workflow-schedule-timing.json'),
  ])
  const summary = buildWorkflowSummary({
    dataStatus, catalog, searchIndex, searchManifest, seriesManifest, waipuIndex, waipuTitles, waipuSync, waipuDetail, presence, canonicalExecutor, candidateInventory, priorityPreview, searchRun, tmdbChanges,
    tmdbChangeRun: activeTmdbChangeRun || lastTmdbChangeRun || {}, baselineData, baselineWaipu, workflowTiming,
    steps: {
      tmdbChanges: process.env.SUMMARY_TMDB_CHANGES,
      tmdbCheckpoint: process.env.SUMMARY_TMDB_CHECKPOINT,
      tmdbStrict: process.env.SUMMARY_TMDB_STRICT,
      tmdbPush: process.env.SUMMARY_TMDB_PUSH,
      waipuSync: process.env.SUMMARY_WAIPU_SYNC,
      waipuCatalog: process.env.SUMMARY_WAIPU_CATALOG,
      canonicalExecutor: process.env.SUMMARY_CANONICAL_EXECUTOR,
      candidateInventory: process.env.SUMMARY_CANDIDATE_INVENTORY,
      priorityPreview: process.env.SUMMARY_PRIORITY_PREVIEW,
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
