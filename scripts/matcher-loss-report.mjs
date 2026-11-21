/** Per-run diagnostic projection. Never re-match, fetch or publish source data.
 * The public repository's explicit XMLTV retention gate forbids exporting
 * original titles, even in Actions artifacts. XMLTV is therefore counts-only.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { projectYoutubeEpisodePlaylistHints } from './publish-youtube-episode-catalog-live.mjs'
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'

export const LOSS_DIR = 'artifacts/matcher-loss-report'
const INPUT = 'artifacts/matcher-loss-input'
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null
const count = v => Number.isSafeInteger(v) && v >= 0 ? v : null
const str = v => typeof v === 'string' ? v : null
const strings = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
const reason = v => typeof v === 'string' && /^[\w-]{1,100}$/.test(v) ? v : 'unknown'
const counts = rows => Object.fromEntries([...new Set(rows.map(x => x.reason))].sort()
  .map(k => [k, rows.filter(x => x.reason === k).length]))
const category = r => /budget|technical|unavailable|missing_metadata|detail_missing|missing-video|incomplete|error/.test(r)
  ? 'technical-or-source-unavailable' : /unsupported_grid_genre|region-excluded|short-video|trailer-clip/.test(r)
    ? 'excluded' : 'unresolved'
function candidate(c) {
  if (!c || !count(c.tmdbId)) return null
  return { tmdbId: c.tmdbId, title: str(c.title), originalTitle: str(c.originalTitle),
    type: str(c.type), year: num(c.year) ?? str(c.year), score: num(c.score),
    runtimeDelta: num(c.runtimeDelta), titleLevel: num(c.titleLevel),
    yearMismatch: typeof c.yearMismatch === 'boolean' ? c.yearMismatch : null,
    sequelConflict: typeof c.sequelConflict === 'boolean' ? c.sequelConflict : null,
    signals: strings(c.signals), matchedInputTitle: str(c.matchedInputTitle) }
}
const candidates = list => (Array.isArray(list) ? list : []).map(candidate).filter(Boolean)
const unavailable = (adapter, stageStatus, why = 'no-current-decision-evidence') => ({
  adapter, stageStatus, status: 'unavailable', reason: why, rows: [], lossCount: null,
  total: null, processed: null, matched: null, unprocessed: null, byReason: {},
})
function finish(adapter, stageStatus, total, processed, matched, rows, extra = {}) {
  if ([total, processed, matched].some(x => count(x) === null) || processed > total || matched > processed ||
      rows.length !== processed - matched) return unavailable(adapter, stageStatus, 'decision-count-mismatch')
  return { adapter, stageStatus, status: processed === total ? 'complete' : 'partial',
    total, processed, matched, unprocessed: total - processed, lossCount: rows.length,
    byReason: counts(rows), byCategory: counts(rows.map(x => ({ reason: x.category }))), rows, ...extra }
}
export function waipuLoss(input, stageStatus) {
  if (input?.kind !== 'waipu-matcher-loss-input' || !Array.isArray(input.classificationLosses) ||
      !Array.isArray(input.unresolvedPrograms)) return unavailable('waipu', stageStatus)
  const raw = [...input.classificationLosses, ...input.unresolvedPrograms]
  if (new Set(raw.map(x => x.programId)).size !== raw.length) return unavailable('waipu', stageStatus, 'duplicate-program-decision')
  const rows = raw.map(x => {
    const r = reason(x.reason)
    return { title: str(x.title), originalTitle: str(x.originalTitle), stage: x.stage || 'tmdb-matching',
      reason: r, category: category(r), metadata: { type: str(x.type), year: num(x.productionYear),
        gridGenre: str(x.gridGenre), mainGenre: str(x.mainGenre), subGenres: strings(x.subGenres),
        productionCountries: strings(x.productionCountries), season: num(x.seasonNumber),
        episode: num(x.episodeNumber), episodeTitle: str(x.episodeTitle),
        classificationSignals: strings(x.classificationSignals), confidence: str(x.classificationConfidence) },
      matcherVersion: num(x.matcherVersion), checkedAt: str(x.checkedAt),
      decisionSource: str(x.source), cache: str(x.cache), scoreMargin: num(x.diagnostic?.margin),
      candidates: candidates([x.diagnostic?.best, x.diagnostic?.runnerUp]) }
  })
  return finish('waipu', stageStatus, input.totalPrograms, input.matchedPrograms + rows.length,
    input.matchedPrograms, rows, { unit: 'unique-source-program', observedAt: input.generatedAt })
}
export function joynLoss(input, stageStatus) {
  if (input?.kind !== 'joyn-matcher-loss-input' || !Array.isArray(input.entries)) return unavailable('joyn', stageStatus)
  if (new Set(input.entries.map(x => x.joynProgramId)).size !== input.entries.length) return unavailable('joyn', stageStatus, 'duplicate-program-decision')
  const rows = input.entries.map(x => {
    const d = x.decision || {}, c = x.joynClassification || {}, a = c.algoliaBase || c.algolia || {}
    const r = reason(d.reason), classificationReason = reason(c.reason)
    const technical = /budget|error|unavailable|failed/.test(classificationReason)
    return { title: str(x.title), stage: 'tmdb-matching', reason: r,
      category: technical ? 'technical-or-source-unavailable' : category(r),
      metadata: { secondaryTitle: str(x.secondaryTitle), channel: str(x.channelTitle),
        durationMinutes: num(x.broadcastDurationMinutes), hasDescription: x.hasDescription === true,
        epgEnriched: x.epgV2Enriched === true, type: str(c.type), classificationReason,
        exactTypes: strings(c.exactTypes), exactCount: count(c.exactCount),
        year: num(a.productionYear), season: num(c.algolia?.seasonNumber), episode: num(c.algolia?.episodeNumber),
        aliases: strings(x.trustedTitleAliases), algoliaReason: reason(c.algolia?.reason),
        seriesDetailStatus: reason(c.seriesDetail?.status) },
      matcherVersion: num(d.matcherVersion), decisionSource: str(d.source), cache: x.fromCache ? 'hit' : 'miss',
      scoreMargin: num(d.diagnosticCandidates?.margin),
      candidates: candidates([d.diagnosticCandidates?.best, d.diagnosticCandidates?.runnerUp]),
      observedLocalCandidates: candidates(x.localCandidates) }
  })
  return finish('joyn', stageStatus, input.totalPrograms, input.processedPrograms, input.matchedPrograms,
    rows, { unit: 'unique-source-program', observedAt: input.generatedAt })
}

const XML_REASONS = ['unclassified','noCandidates','nonexact','yearConflict','other']
const XML_DETAIL_REASONS = ['invalid_candidate','unmapped_station','ambiguous_timezone','unclassified_media',
  'no_local_tmdb_candidates','no_candidate','below_threshold','ambiguous_exact_title','ambiguous_margin',
  'tmdb_unmatched','nonexact_match_requires_review','production_year_conflict','projection_rejected','other']
export function xmltvLoss(input, stageStatus) {
  const missing = unavailable('xmltv', stageStatus)
  if (input?.kind !== 'xmltv-matcher-loss-counts' || !count(input.validatedSources) ||
    !input.stations || typeof input.stations !== 'object') return missing
  const stationRows = Object.entries(input.stations)
  const reviewed = new Set(XMLTV_REVIEWED_STATIONS.map(s => s.stationId))
  if (stationRows.length !== reviewed.size || stationRows.some(([station, row]) => !reviewed.has(station) ||
    ['selected','accepted',...XML_REASONS].some(k => count(row?.[k]) === null) ||
    row.selected !== row.accepted + XML_REASONS.reduce((n,k) => n + row[k], 0))) return missing
  const sum = k => stationRows.reduce((n,[,row]) => n + row[k], 0)
  if (sum('selected') !== input.selected || sum('accepted') !== input.matched) return missing
  const exact = input.lossReasons && XML_DETAIL_REASONS.every(k => count(input.lossReasons[k]) !== null) &&
    XML_DETAIL_REASONS.reduce((n,k) => n + input.lossReasons[k],0) === input.selected - input.matched
    ? Object.fromEntries(XML_DETAIL_REASONS.map(k=>[k,input.lossReasons[k]])) : null
  return { adapter: 'xmltv', stageStatus, status: 'counts-only-rights-restricted',
    unit: 'source-broadcast-row', total: input.selected, processed: input.selected,
    matched: input.matched, unprocessed: 0, lossCount: input.selected - input.matched, validatedSources:input.validatedSources,
    byReason: exact ?? Object.fromEntries(XML_REASONS.map(k => [k,sum(k)])),
    stations: Object.fromEntries(stationRows.map(([k,row]) => [k,Object.fromEntries(
      ['selected','accepted',...XML_REASONS].map(f => [f,row[f]]))])), rows: [],
    resolverDiagnostics:Object.fromEntries(['localConflicts','invalidLocal','cacheAmbiguousRows',
      'cacheNoExactCandidateRows','apiBudgetMisses','apiFailedRequests','apiStoppedMisses'].map(k=>[k,count(input.resolverDiagnostics?.[k])])),
    titleExportPermitted: false, restriction: 'XMLTV original-source retention gate: no titles or original metadata in artifacts.' }
}

export function youtubeLoss(research, queue, episode, episodeSummary, stageStatus, episodeStatus) {
  const missing = unavailable('youtube', stageStatus)
  if (research?.summary?.mode !== 'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY' || !Array.isArray(research.rows)) return missing
  const byId = new Map(research.rows.map(r => [r.videoId,r]))
  const total = research.summary.sourceVideoIds
  if (byId.size !== research.rows.length || byId.size !== total) return missing
  const queueValid = queue?.kind === 'moviehub-youtube-g2-actionable-review-queue' && Array.isArray(queue.items) &&
    queue.sourceVideoIds === total && queue.items.length === total && new Set(queue.items.map(r => r.videoId)).size === total &&
    queue.items.every(r => byId.has(r.videoId) && ['playlist-link-published','review-only'].includes(r.publicationStatus))
  let acceptedEpisodes = new Set()
  if (episodeStatus === 'success' && episodeSummary?.kind === 'moviehub-youtube-episode-playlist-source-summary') {
    try {
      const result = projectYoutubeEpisodePlaylistHints(episode, { now: episodeSummary.generatedAt })
      if (result.byKey.size === episodeSummary.provisionalEpisodeLinks) acceptedEpisodes = new Set([...result.byKey.values()].map(x => x.hint.videoId))
    } catch { /* No episode identity accepted without validated evidence. */ }
  }
  const episodeRows = new Map((episode?.cases || []).map(x => [x.videoId,x]))
  const queueRows = new Map(queueValid ? queue.items.map(x => [x.videoId,x]) : [])
  const rows = []
  let matched = 0
  for (const [id, r] of byId) {
    const q = queueRows.get(id), e = episodeRows.get(id)
    if (q?.publicationStatus === 'playlist-link-published' || acceptedEpisodes.has(id)) { matched++; continue }
    const code = reason(e?.status ?? q?.lane ?? r.matchStatus)
    const technical = r.errors?.length > 0 || /unavailable|missing-video|no-eligible/.test(code)
    rows.push({ title: str(r.videoTitle), stage: e ? 'episode-review' : 'playlist-film-review',
      reason: code, category: technical ? 'technical-or-source-unavailable' : !queueValid ? 'review-not-final' : category(code),
      matcherStatus: reason(r.matchStatus), metadata: { playlistClass: str(q?.playlistClass ?? r.editorialOfferHint),
        durationMinutes: num(r.minutes), queryVariants: strings(r.tmdbQueries), queryReason: str(r.curatedQueryReason),
        sourceDetailsAvailable: r.sourceVideoDetailAvailable === true, sourceStatus: reason(r.sourceStatus),
        alternativeTvIds: (r.alternativeTvIds || []).filter(x => count(x) !== null), identityRisk: str(r.identityRisk),
        episodeMarker: e ? { season: num(e.canonicalEpisodeProposal?.seasonNumber ?? r.episodeMarker?.seasonNumber),
          episode: num(e.canonicalEpisodeProposal?.episodeNumber ?? r.episodeMarker?.episodeNumber) } : null },
      candidates: candidates(r.topCandidates), catalogMembership: str(q?.completeCatalogMembership),
      publicationStatus: q ? str(q.publicationStatus) : 'not-confirmed',
      technicalErrorCount: r.errors?.length ?? 0 })
  }
  const report = finish('youtube', stageStatus, total, total, matched, rows,
    { unit: 'unique-playlist-video', observedAt: research.summary.generatedAt, finalQueueAvailable: queueValid,
      scope: 'Playlist-to-TMDB. TMDB-to-YouTube discovery/known rechecks remain count-only in the chain report.' })
  if (!queueValid && report.status === 'complete') report.status = 'partial-review-not-final'
  return report
}

const read = async (input, path) => { try { return JSON.parse(await input(path,'utf8')) } catch { return null } }
export async function writeMatcherLossReport({ env = process.env, input = readFile, out = LOSS_DIR } = {}) {
  const [w,j,x,y,q,e,es] = await Promise.all([
    INPUT+'/waipu.json',INPUT+'/joyn.json',INPUT+'/xmltv.json',
    'artifacts/youtube-g2/curated-tmdb-membership/qa.json',
    'artifacts/youtube-g2/actionable-review-queue/qa.json',
    'artifacts/youtube-g2/series-episode-review/qa.json','public/youtube-episode-playlist-summary.json',
  ].map(p => read(input,p)))
  const adapters = [waipuLoss(w,env.LOSS_WAIPU),joynLoss(j,env.LOSS_JOYN),
    xmltvLoss(x,env.LOSS_XMLTV),youtubeLoss(y,q,e,es,env.LOSS_YOUTUBE,env.LOSS_EPISODES)]
  const generatedAt = new Date().toISOString()
  const run = { id: env.GITHUB_RUN_ID ?? null, attempt: env.GITHUB_RUN_ATTEMPT ?? null }
  await mkdir(out,{recursive:true})
  for (const a of adapters) await writeFile(`${out}/${a.adapter}.json`,JSON.stringify({schemaVersion:1,run,generatedAt,...a},null,2)+'\n',{mode:0o600})
  const summary = { kind:'moviehub-matcher-loss-summary',schemaVersion:1,run,generatedAt,
    adapters: Object.fromEntries(adapters.map(a => [a.adapter,{ status:a.status, total:a.total,
      processed:a.processed, matched:a.matched, unprocessed:a.unprocessed, lossCount:a.lossCount,
      titleRows:a.rows.length, byReason:a.byReason, byCategory:a.byCategory ?? {} }])) }
  await writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({kind:summary.kind,adapters:Object.fromEntries(adapters.map(a=>[a.adapter,{status:a.status,lossCount:a.lossCount}]))}))
  return summary
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  writeMatcherLossReport().catch(() => { console.error('Matcher loss report unavailable');process.exitCode=1 })
