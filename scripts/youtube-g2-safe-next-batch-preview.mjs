/**
 * Offline "next step" bridge across existing canonical queue, private
 * progress cursor and conservative per-Pacific-day search reservations.
 *
 * CRITICAL: This returns a hypothetical plan ONLY. It performs NO GCS
 * reservation, NO real quota check, NO YouTube search, NO cursor update,
 * NO DE offer/playback publication. External collaborators still share
 * the actual Google project search bucket.
 */
import {createHash} from 'node:crypto'
import {createYoutubeFullCatalogResearchPlan}
  from './youtube-g2-full-catalog-queue.mjs'
import {validateProgress}
  from './youtube-g2-durable-bootstrap-progress.mjs'
import {prepareResearchReservation,ADAPTER_SEARCH_DAY_CAP}
  from './youtube-g2-atomic-search-budget-ledger.mjs'

export const PREVIEW_KIND='moviehub-youtube-g2-coordinated-bootstrap-preview'
export const MAX_PREVIEW_MOVIES=5
const fingerprint=ids=>createHash('sha256')
  .update(JSON.stringify(ids)).digest('hex')

export function previewCoordinatedBootstrapBatch({
  inventory,publicIndex,knownVideoCandidatesByTmdbId=null,
  progress=null,previousQa=null,previousRunId=null,
  preflight,existingDailyLedger=null,runId,
  now=new Date().toISOString(),
}={}){
  const previous=progress===null?null:validateProgress(progress)
  if(previous===null&&(previousQa!==null||previousRunId!==null))
    throw Error('YOUTUBE_PREVIEW_UNEXPECTED_PRIOR_QA')
  if(previous!==null){
    if(previous.completed||!previous.batches.length
      ||!Number.isSafeInteger(previousRunId)
      ||previous.batches.at(-1).runId!==previousRunId
      ||previousQa?.plan?.batch?.offset!==previous.batches.at(-1).offset
      ||previousQa?.plan?.batch?.selectedCount!==
        previous.batches.at(-1).selectedCount
      ||previousQa?.plan?.batch?.queueIdentity!==previous.queueIdentity
      ||!Number.isFinite(Date.parse(previous.updatedAt))
      ||Date.parse(previous.updatedAt)>Date.parse(now))
      throw Error('YOUTUBE_PREVIEW_PRIOR_QA_NOT_LINKED_TO_CURSOR')
  }
  // The established canonical queue owns selection order, the exact public
  // badge generation and the known-ID reuse policy. Do not invent another.
  const plan=createYoutubeFullCatalogResearchPlan({
    inventory,publicIndex,knownVideoCandidatesByTmdbId,
    offset:previous?.nextOffset??0,
    limit:MAX_PREVIEW_MOVIES,
    continuation:previousQa,now,
    searchesPerTitle:1,
  })
  const batch=plan.batch
  if(previous&&(previous.total!==batch.total
    ||previous.queueIdentity!==batch.queueIdentity))
    throw Error('YOUTUBE_PREVIEW_PUBLIC_QUEUE_CHANGED_STOP')
  if(batch.selectedCount<1||batch.selectedCount>MAX_PREVIEW_MOVIES
    ||batch.offset!== (previous?.nextOffset??0)
    ||batch.selectedCount!==plan.plan.length
    ||batch.realYoutubeApiRequestsPerformed!==0
    ||batch.tmdbApiRequestsPerformed!==0
    ||batch.defaultDailyCallLimitIsProjectActual!==false
    ||batch.youtubeSearchCallsPlanned>ADAPTER_SEARCH_DAY_CAP
    ||batch.estimatedYoutubeSearchQuotaUnits!==batch.youtubeSearchCallsPlanned
    ||plan.publicationPermitted!==false||plan.verifiedDEOffers!==0
    ||plan.confirmedDirectLinks!==0||plan.catalogWrites!==0
    ||plan.firestoreWrites!==0||plan.providerWrites!==0
    ||plan.badgeWrites!==0||plan.nightlyWrites!==0
    ||plan.plan.some(x=>x?.confirmedVideoId!==null
      ||x?.playbackRoute!==null||x?.publicationPermitted!==false))
    throw Error('YOUTUBE_PREVIEW_PLANNED_BATCH_UNSAFE')
  if(batch.youtubeSearchCallsPlanned===0)
    throw Error('YOUTUBE_PREVIEW_ONLY_KNOWN_VIDEO_IDS_USE_METADATA_REFRESH')
  // Pure calculation. This is NOT reserveWithAtomicGcs; returning a ledger
  // snapshot cannot grant quota or satisfy an admission guard in live code.
  const estimated=prepareResearchReservation({
    now,runId,calls:batch.youtubeSearchCallsPlanned,preflight,
    previous:existingDailyLedger,
  })
  if(estimated.reservationCalls!==batch.youtubeSearchCallsPlanned
    ||estimated.projectCallsRemaining!==null
    ||estimated.automaticSearchApproved!==false)
    throw Error('YOUTUBE_PREVIEW_NOT_A_RESERVATION')
  return {
    kind:PREVIEW_KIND,
    generatedAt:new Date(now).toISOString(),
    sourceQueueDigest:batch.queueIdentity,
    selectedPublicWorkDigest:fingerprint(plan.plan.map(x=>x.key)),
    startOffset:batch.offset,nextOffsetIfSuccessful:batch.nextOffset,
    totalBadgeMovieCount:batch.total,
    plannedFilmHypotheses:batch.selectedCount,
    knownVideoCandidateMovieCount:batch.knownCandidateReuseMovies,
    searchesAvoidedByCandidateReuse:batch.youtubeSearchCallsAvoided,
    proposedNewSearchCalls:batch.youtubeSearchCallsPlanned,
    searchStrategy:'one-precise-query-first; followup-separately-authorized',
    automaticSecondSearchEnabled:false,
    proposedInternalDayReservedAfter:estimated.spentOrReserved,
    pacificQuotaDay:estimated.day.date,
    // This preview has zero authority; all later live actions must perform
    // an independently authenticated main-only OIDC CAS reservation,
    // recheck 429/remaining quota and link actual QA to the cursor.
    actualProjectQuotaRemaining:null,
    preflightIsRealTimeQuotaGuarantee:false,
    externalProjectCallersCoordinated:false,
    durableReservationWritten:false,
    cursorAdvanced:false,
    automaticSearchEnabled:false,
    authorizedSearchCalls:0,
    youtubeApiCallsPerformed:0,
    verifiedGermanOffers:0,publishedPlaybackRoutes:0,
    firestoreWrites:0,providerWrites:0,
    privatePreview:true,publicationPermitted:false,
  }
}
