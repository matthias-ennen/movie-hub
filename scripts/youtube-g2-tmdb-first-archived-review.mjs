/**
 * Rebuild the PRIVATE TMDB-first 25-film reviewer from an authenticated,
 * already completed GitHub Actions archival QA run. No network, no YouTube
 * API, no new source claim, no offer/route/catalog publication.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {
  TMDB_FIRST_GOLDEN,compareTmdbFirstPilotToGolden,
} from './youtube-g2-quality-golden.mjs'
import {
  buildTmdbFirstReviewPack,renderTmdbFirstReviewPack,
} from './youtube-g2-tmdb-first-review-pack.mjs'

export const ARCHIVED_SOURCE_RUN=40086393094
export const ARCHIVED_SOURCE_HEAD_SHA='6c1d1070ed39691256e8e8c9b5cd08fdbbf1425c'
export const ARCHIVED_REVIEW_KIND='moviehub-youtube-g2-tmdb-first-archival-offline-replay'
const int=x=>Number.isInteger(x)&&x>=0

export function buildArchivedTmdbFirstReview(qa){
  const s=qa?.summary
  if(s?.historicalCohortMovies!==25
    ||s.historicalCohortAccountedFor!==25
    ||s.selectedMovies!==25
    ||s.fullAccountInventory!=='not-loaded'
    ||s.priorDeviceCandidatesApprovedAsOffers!==0
    ||!int(s.calls?.youtubeSearches)||s.calls.youtubeSearches>50
    ||!int(s.calls?.youtubeVideoLookups)||s.calls.youtubeVideoLookups>11
    ||!int(s.calls?.tmdbGetRequests)||s.calls.tmdbGetRequests>51){
    throw Error('ARCHIVED_GOLDEN_SOURCE_BUDGET_OR_COHORT_INVALID')
  }
  // Reuses the existing independent 25-TMDB-ID identity comparison,
  // including the vanished-badge row. No guessing from a different sample.
  const comparison=compareTmdbFirstPilotToGolden(qa)
  const review=buildTmdbFirstReviewPack(qa)
  const rowIds=new Set(qa.rows.map(r=>r.tmdbId))
  if(review.sourceSelectedFilms!==TMDB_FIRST_GOLDEN.length
    ||TMDB_FIRST_GOLDEN.some(g=>!rowIds.has(g.tmdbId))
    ||review.actuallyApiResearchedMovies!==s.processedMovies
    ||review.items.length!==TMDB_FIRST_GOLDEN.length
    ||review.approvedDirectLinks!==0||review.verifiedDEOffers!==0
    ||review.publicationPermitted!==false
    ||review.items.some(r=>r.independentOfferApproved!==false
      ||r.playbackRoute!==null||r.publicationPermitted!==false)){
    throw Error('ARCHIVED_GOLDEN_REVIEW_INTEGRITY_FAILED')
  }
  const allCandidates=qa.rows.flatMap(r=>r.videoCandidates)
  const distinct=new Set(allCandidates.map(c=>c.videoId))
  const expectedCandidates=review.items.reduce((sum,item)=>sum+item.candidateVideos.length,0)
  if(allCandidates.length!==expectedCandidates||distinct.size>allCandidates.length){
    throw Error('ARCHIVED_GOLDEN_CANDIDATE_LOSS')
  }
  const summary={
    kind:ARCHIVED_REVIEW_KIND,
    sourceRun:ARCHIVED_SOURCE_RUN,
    sourceCommit:ARCHIVED_SOURCE_HEAD_SHA,
    sourceType:'historical-completed-real-api-qa-not-current-api',
    privateArtifact:true,publicationPermitted:false,
    historicalCohort:25,actuallyResearchedInHistoricalRun:s.processedMovies,
    badgesMissingInHistoricalRun:comparison.historicalPublicBadgesMissing,
    historicalSearchCalls:s.calls.youtubeSearches,
    currentYoutubeSearchCalls:0,currentYoutubeVideoLookups:0,
    rawCandidateCount:allCandidates.length,distinctVideoIds:distinct.size,
    strongCrossWorkVideoIdConflicts:review.crossWorkStrongVideoIdCollisions.length,
    statusCounts:review.lanes,editionClasses:review.editionClasses,
    historicalStatusDriftFromOriginalPilot:comparison.reviewDeltas.length,
    approvedGermanOffers:0,publishedDirectRoutes:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
  }
  return {summary,review,comparison}
}
export function renderArchivedTmdbFirstReview({summary,review,comparison}){
  return [
    '# MovieHub YouTube: originaler 25-Film-Vergleich – Offline-Wiederaufbereitung',
    '',
    '- Quelle: historischer erfolgreicher Actions-Live-Lauf #'+summary.sourceRun,
    '- Kein aktueller neuer API-Lauf! YouTube search.list wurde hier **0-mal** abgefragt.',
    '- Historisch untersuchte Filme: '+summary.actuallyResearchedInHistoricalRun+'/25',
    '- Historisch fehlende öffentliche YouTube-Badges: '+summary.badgesMissingInHistoricalRun,
    '- Historische Suchaufrufe: '+summary.historicalSearchCalls+' (werden NICHT wiederholt)',
    '- Einzelne Videokandidaten: '+summary.rawCandidateCount+'; eindeutige IDs: '+summary.distinctVideoIds,
    '- Editionen/Quellen: '+JSON.stringify(summary.editionClasses),
    '- Starke filmübergreifende Video-ID-Konflikte: '+summary.strongCrossWorkVideoIdConflicts,
    '- Änderungen gegenüber dem ursprünglichen historischen Golden-Set: '+comparison.reviewDeltas.length,
    '- **0 unabhängig verifizierte deutsche Angebote, 0 freigegebene Direktlinks.**',
    '- Kein Firestore, Katalog, Anbieterbadge oder produktiver Quellvertrag verändert.',
    '- Ergebnisse nur im privaten 7-Tage-Actions-Artefakt; keine Freigabe aus Suchmetadaten.',
    '',
    renderTmdbFirstReviewPack(review),
  ].join('\n')
}
export async function writeArchivedTmdbFirstReview({
  source='artifacts/youtube-g2/tmdb-first-link-pilot/qa.json',
  output='artifacts/youtube-g2/tmdb-first-archived-review',
}={}){
  const qa=JSON.parse(await readFile(source,'utf8'))
  const data=buildArchivedTmdbFirstReview(qa)
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/summary.json',JSON.stringify(data.summary,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/review-queue.json',JSON.stringify(data.review,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/golden-compare.json',JSON.stringify(data.comparison,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/review-queue.md',renderArchivedTmdbFirstReview(data)+'\n',{mode:0o600}),
  ])
  process.stdout.write(JSON.stringify(data.summary)+'\n')
  return data
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeArchivedTmdbFirstReview().catch(error=>{
    console.error('PRIVATE OFFLINE GOLDEN REVIEW FAILED CLOSED: '+error.message)
    process.exitCode=1
  })
}
