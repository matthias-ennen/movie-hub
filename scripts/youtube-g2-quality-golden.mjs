/**
 * YouTube G2 AP1 -- immutable SOURCE-OBSERVED matcher regression cases.
 *
 * TMDB-first: original real 25-film pilot (#39783106689, 22 Oct 2026).
 * Playlist-first: risk and link anchors from private deploy QA (#40076952128).
 *
 * A search score / a past "single" pilot label is not a verified playback
 * route, a permitted offer, a legally authorized source or ground truth.
 * Only two TMDB-first IDs have separately REPORTED successful user device
 * playback observations (not an independent DE offer/rights approval).
 *
 * These manifests have no profile, Firestore, membership or account data.
 */
import {G2_REVIEW_KIND} from './youtube-g2-actionable-review-queue.mjs'
import {TMDB_FIRST_SOURCE_MODE} from './youtube-g2-tmdb-first-link-model.mjs'

export const YOUTUBE_G2_QUALITY_GOLDEN_KIND='moviehub-youtube-g2-observed-quality-regression-set'
export const TMDB_FIRST_PILOT_RUN=39783106689
export const PLAYLIST_FIRST_REFERENCE_RUN=40076952128
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const kinds=new Set(['single','multiple','unresolved'])
const pilotStatus={
  single:'review-single-video-candidate',
  multiple:'review-multiple-video-editions',
  unresolved:'review-weak-or-unresolved-videos',
}
/** Reference [TMDB film ID, OBSERVED pilot review category, leading candidate video ID].
 * Only FIRST candidate is recorded. It is NOT a verified correct link.
 */
const PILOT25=[
  [9479,'unresolved','4ygSMAOvNbc'],
  [238,'single','xcCsnx-GRkA'],
  [872585,'single','_1WjM7ucekc'],
  [840464,'unresolved','wz1EBsswF_Y'],
  [385687,'multiple','sF6aF9AzEPg'],
  [338953,'single','4KTVlPLoX6M'],
  [399566,'single','muCvaQqZOFs'],
  [515001,'single','wb4jfigVEZc'],
  [455839,'multiple','QduoL3vVcgk'],
  [337167,'unresolved','S22QyVI5Ryw'],
  [513434,'single','a5SjkgnykNk'],
  [425134,'single','7EEzPFcjVfo'],
  [333385,'multiple','gUgCFmNy4gM'],
  [254320,'multiple','Zpkekh50sHE'],
  [184315,'multiple','Mf_iQ4SO9yw'],
  [121986,'single','BM7h32RI-Vc'],
  [17578,'single','hcs0MhDKaUY'],
  [56623,'unresolved','PzrDpT4biNE'],
  [2062,'single','7Us3HZB_gGc'],
  [393,'single','Av1NpjC1yes'],
  [146,'unresolved','Nb5wScLpRm8'],
  [10830,'multiple','KGRabMHj8Ew'],
  [709,'single','ip0bQ_BQCAc'],
  [240,'unresolved','W4P2MVO9_Vc'],
  [1087388,'single','sdd68kn0oG4'],
]
export const TMDB_FIRST_GOLDEN=Object.freeze(PILOT25.map(([tmdbId,observedClass,leadId])=>
  Object.freeze({
    tmdbId,observedClass,leadVideoId:leadId,
    independentlyVerifiedDeOffer:false,
    manualDevicePlaybackReported:tmdbId===238||tmdbId===872585,
  })
))
/**
 * Playlist FIRST reference [videoId, observed review lane, TMDB hypothesis].
 * Anchor a whole range of failure modes, not an individual match score.
 * An unavailable source can recover later: changes are REVIEW DELTAS,
 * not immutable blocks or grounds for deleting a route.
 */
const PLAYLIST_ANCHORS=[
 ['2jc3mP9mvOk','existing-movie-linked',1266],
 ['yszdWjYOtLU','existing-movie-linked',10782],
 ['xJ2PbAb2zCw','existing-movie-linked',158],
 ['1uf2AMrQMk0','existing-movie-linked',10586],
 ['3csAkKfa6Vs','existing-movie-linked',11607],
 ['a74REkiUGWo','search-only-needs-identity-proof',8337],
 ['70DVMOSzN3E','movie-versus-series',1368],
 ['po_2YIkVroA','movie-versus-series',10685],
 ['NljWzWfNdfQ','movie-versus-series',949],
 ['KQeEIbN296U','existing-movie-needs-identity-proof',390051],
 ['WWaDDo2DAmM','existing-movie-needs-identity-proof',8922],
 ['z-BV2GmNi0w','edition-or-source-conflict',820],
 ['2H65OYPdBAo','edition-or-source-conflict',2668],
 ['nZzSVyw4ktA','edition-or-source-conflict',755],
 ['ucRKSNwzM_w','ambiguous-work-identity',9730],
 ['trbQjOJLIqM','ambiguous-work-identity',9495],
 ['OXXkaZvKPjw','ambiguous-work-identity',null],
 ['Etlfq9KD78Q','new-release-content-check',1291595],
 ['wg8s97MFqUY','unresolved-title',null],
 ['sNrYK2m5LJs','region-excluded',null],
 ['OVNYmGj3ii4','short-video-not-full-film',null],
 ['xWkLYgaorAI','missing-video-metadata',null],
 ['qOyaKLGLVTM','missing-video-metadata',null],
 ['YsJu3W7zNSU','missing-video-metadata',null],
 ['eOWc9NNvBjU','missing-video-metadata',null],
 ['8HVSET2vIU4','missing-video-metadata',null],
 ['o1dYrexR3-A','missing-video-metadata',null],
 ['iSH8ck3VfZM','missing-video-metadata',null],
 ['7nIkx9bCbkk','missing-video-metadata',null],
 ['oxuSEVhqd1Q','missing-video-metadata',null],
]
export const PLAYLIST_FIRST_GOLDEN=Object.freeze(PLAYLIST_ANCHORS.map(
  ([videoId,observedLane,tmdbHypothesis])=>Object.freeze({
    videoId,observedLane,tmdbHypothesis,
    // Even successfully published editorial links are not verified DE offers.
    independentlyVerifiedDeOffer:false,
    userPlaybackReported:['2jc3mP9mvOk','yszdWjYOtLU','xJ2PbAb2zCw'].includes(videoId),
  })
))
/** Explicitly removed by user: unauthorized duplicate FREE upload.
 * Do not turn the historical (absent) ID back into a "golden positive".
 */
export const REMOVED_UNAUTHORIZED_FREE_VIDEO_ID='RqLsh88GYKc'
export const KNOWN_SEARCH_MISS={
  tmdbId:9479,observedExactVideoId:'nJf67zNZhoc',
  // Earlier user-reported successful video ID was NOT among the pilot's results.
  // search.list absence must not mean "not available at YouTube".
  source:'earlier-user-device-observation-not-returned-by-search',
}

export function validateG2QualityGoldenManifest(){
  if(TMDB_FIRST_GOLDEN.length!==25
    ||PLAYLIST_FIRST_GOLDEN.length<25
    ||new Set(TMDB_FIRST_GOLDEN.map(x=>x.tmdbId)).size!==25
    ||new Set(PLAYLIST_FIRST_GOLDEN.map(x=>x.videoId)).size!==PLAYLIST_FIRST_GOLDEN.length
    ||TMDB_FIRST_GOLDEN.some(x=>!Number.isInteger(x.tmdbId)||x.tmdbId<1
      ||!kinds.has(x.observedClass)||!VIDEO.test(x.leadVideoId)
      ||x.independentlyVerifiedDeOffer!==false)
    ||PLAYLIST_FIRST_GOLDEN.some(x=>!VIDEO.test(x.videoId)
      ||!x.observedLane||x.independentlyVerifiedDeOffer!==false)
    ||PLAYLIST_FIRST_GOLDEN.some(x=>x.videoId===REMOVED_UNAUTHORIZED_FREE_VIDEO_ID))
    throw Error('YOUTUBE_G2_QUALITY_GOLDEN_MANIFEST_INVALID')
  const counts=Object.fromEntries([...kinds].map(k=>[
    k,TMDB_FIRST_GOLDEN.filter(x=>x.observedClass===k).length]))
  if(counts.single!==13||counts.multiple!==6||counts.unresolved!==6)
    throw Error('YOUTUBE_G2_QUALITY_PILOT_COUNTS_UNEXPECTED')
  return counts
}
export function compareTmdbFirstPilotToGolden(pilot){
  const historical=validateG2QualityGoldenManifest()
  if(pilot?.summary?.mode!==TMDB_FIRST_SOURCE_MODE
    ||pilot.summary.processedMovies!==25
    ||pilot.summary.publicationPermitted!==false
    ||pilot.summary.verifiedDirectLinks!==0
    ||pilot.summary.verifiedSeriesEpisodes!==0
    ||!Array.isArray(pilot.rows)||pilot.rows.length!==25
    ||new Set(pilot.rows.map(x=>x.tmdbId)).size!==25
    ||['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
      .some(k=>pilot.summary[k]!==0))
    throw Error('YOUTUBE_G2_PILOT_REVIEW_NOT_TRUSTED')
  const rows=new Map(pilot.rows.map(x=>[x.tmdbId,x]))
  let observedSameClass=0,observedSameLeadVideoId=0
  const reviewDeltas=[]
  for(const g of TMDB_FIRST_GOLDEN){
    const row=rows.get(g.tmdbId)
    if(!row||row.publicationPermitted!==false||row.directPlaybackRoute!==null
      ||row.reviewedVideoId!==null
      ||!Array.isArray(row.videoCandidates)
      ||row.videoCandidates.some(x=>!VIDEO.test(x.videoId)))
      throw Error('YOUTUBE_G2_PILOT_REVIEW_LINK_UNSAFE_OR_MISSING')
    const classMatches=row.status===pilotStatus[g.observedClass]
    const leadMatches=row.videoCandidates[0]?.videoId===g.leadVideoId
    if(classMatches)observedSameClass++
    if(leadMatches)observedSameLeadVideoId++
    if(!classMatches||!leadMatches)reviewDeltas.push({
      tmdbId:g.tmdbId,previousClass:g.observedClass,
      observedClass:row.status,previousLeadVideoId:g.leadVideoId,
      observedLeadVideoId:row.videoCandidates[0]?.videoId||null,
      disposition:'candidate-drift-requires-review-not-auto-publication',
    })
  }
  return {
    sourceRun:TMDB_FIRST_PILOT_RUN,
    selected:25,historicalClassCounts:historical,
    observedSameClass,observedSameLeadVideoId,
    reviewDeltas,independentlyVerifiedDEOffers:0,
    directLinksAutoApproved:0,
  }
}
export function comparePlaylistReviewToGolden(reviewQueue){
  validateG2QualityGoldenManifest()
  if(reviewQueue?.kind!==G2_REVIEW_KIND||reviewQueue.privateArtifact!==true
    ||reviewQueue.publicationPermitted!==false
    ||reviewQueue.independentVerifiedDEOffers!==0
    ||reviewQueue.missingVideos!==0
    ||reviewQueue.accountedForVideos!==reviewQueue.sourceVideoIds
    ||!Array.isArray(reviewQueue.items)
    ||reviewQueue.items.length!==reviewQueue.sourceVideoIds
    ||reviewQueue.publishedPlaylistLinks+reviewQueue.pendingReview!==reviewQueue.sourceVideoIds
    ||new Set(reviewQueue.items.map(x=>x.videoId)).size!==reviewQueue.items.length)
    throw Error('YOUTUBE_G2_PLAYLIST_GOLDEN_SOURCE_NOT_TRUSTED')
  const live=new Map(reviewQueue.items.map(x=>[x.videoId,x]))
  const present=[],absent=[],changed=[],fixed=[]
  for(const g of PLAYLIST_FIRST_GOLDEN){
    const row=live.get(g.videoId)
    if(!row){absent.push(g.videoId);continue}
    if(row.sourceVerifiedDEOffer!==false
      ||!['playlist-link-published','review-only'].includes(row.publicationStatus))
      throw Error('YOUTUBE_G2_PLAYLIST_GOLDEN_VERIFICATION_OR_STATUS_UNSAFE')
    present.push(g.videoId)
    if(row.lane!==g.observedLane){
      changed.push({videoId:g.videoId,previousLane:g.observedLane,
        observedLane:row.lane,disposition:'review-delta-not-automatic-approval'})
    }else fixed.push(g.videoId)
  }
  const removedUpload=live.get(REMOVED_UNAUTHORIZED_FREE_VIDEO_ID)
  return {
    sourceRun:PLAYLIST_FIRST_REFERENCE_RUN,
    historicalSampleSize:PLAYLIST_FIRST_GOLDEN.length,
    currentSourceVideoIds:reviewQueue.sourceVideoIds,
    anchorsPresent:present.length,anchorsAbsent:absent.length,
    unchangedAnchors:fixed.length,changedAnchors:changed.length,
    absentSourceIds:absent,reviewDeltas:changed,
    removedUnauthorizedFreeUploadPresent:Boolean(removedUpload),
    removedUnauthorizedFreeUploadStatus:removedUpload
      ?'reappeared-requires-explicit-source-authorization-review'
      :'not-in-current-source',
    userTestedPositiveAnchorsPresent:PLAYLIST_FIRST_GOLDEN
      .filter(g=>g.userPlaybackReported&&live.has(g.videoId)).length,
    independentlyVerifiedDEOffers:0,
    automaticApprovals:0,
  }
}

export function buildG2QualityGoldenReport({reviewQueue,historicalTmdbPilot=null}={}){
  const manifest=validateG2QualityGoldenManifest()
  const playlist=comparePlaylistReviewToGolden(reviewQueue)
  const tmdb=historicalTmdbPilot
    ?compareTmdbFirstPilotToGolden(historicalTmdbPilot)
    :{sourceRun:TMDB_FIRST_PILOT_RUN,selected:25,
      historicalClassCounts:manifest,liveRerunPerformed:false,
      directLinksAutoApproved:0,independentlyVerifiedDEOffers:0}
  return {
    kind:YOUTUBE_G2_QUALITY_GOLDEN_KIND,schemaVersion:1,
    privateArtifact:true,publicationPermitted:false,
    referenceMode:'historical-candidate-outcomes-not-independently-verified-offers',
    tmdbFirst:tmdb,playlistFirst:playlist,
    knownTmdbSearchFalseNegative:{...KNOWN_SEARCH_MISS},
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,
    quotaSearchApiCalls:0,
  }
}
