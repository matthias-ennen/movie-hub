/**
 * Production nightly TMDB-first research.
 * Google decides the search.list limit; no locally reserved quota or artificial
 * 50/200-call cap can stop the loop while eligible films remain.
 * Candidate metadata remains private and cannot publish DE offers.
 */
import {runTmdbFirstLinkPilot} from './youtube-g2-tmdb-first-link-pilot.mjs'
import {exactYoutubeProviderIds,exactDeYoutubeOfferTypes}
  from './youtube-g2-tmdb-first-link-model.mjs'
import {loadNightlyQueue,putNightlyResult,saveNightlyQueue,
  selectNightlyPublicBadgeMovies} from './youtube-g2-nightly-queue.mjs'
import {loadDurableCandidateCheckpoint,mergeCandidateCheckpoint,
  saveDurableCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'
import {ensureSearchJournal,changeSearchJournal}
  from './youtube-g2-nightly-search-journal.mjs'
import {pacificSearchDay} from './youtube-g2-pacific-search-preflight.mjs'

export const REAL_QUOTA_MAX_PREFLIGHT_FILMS=600
export const REAL_QUOTA_MIN_SEARCH_INTERVAL_MS=2000
// Temporary throttling must get a meaningful cooldown. A 429 without an
// explicit quotaExceeded reason is not proof the daily allowance has ended.
export const REAL_QUOTA_MAX_RATE_LIMIT_RETRIES=9
export const REAL_QUOTA_MAX_TRANSIENT_RETRIES=4
// 9 progressively longer gaps between 10 search attempts = 60 minutes.
// These are retry pauses, not a daily quota cap or a promise of Google recovery.
export const REAL_QUOTA_RATE_RETRY_GAPS_MS=Object.freeze(
  [1,2,3,4,5,6,9,12,18].map(minutes=>minutes*60000))
export const REAL_QUOTA_RATE_RETRY_WINDOW_MS=
  REAL_QUOTA_RATE_RETRY_GAPS_MS.reduce((sum,gap)=>sum+gap,0)
export const REAL_QUOTA_MAX_RATE_BACKOFF_MS=18*60000
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const isQuota=error=>
  /^YouTube API: HTTP (?:403|429) bei search \[QUOTA_EXHAUSTED\]/.test(String(error?.message))
const isRate=error=>
  /^YouTube API: HTTP (?:403|429) bei search \[(?:RATE_LIMITED|RATE_LIMIT_OR_QUOTA_UNCLASSIFIED|QUOTA_OR_RATE_LIMIT)\]/.test(String(error?.message))
const isTemporary=error=>
  /^YouTube API: Netzwerk- oder Zeitüberschreitungsfehler bei search/.test(String(error?.message))
  ||/^YouTube API: HTTP 5\d\d bei search/.test(String(error?.message))
const protectedResult=data=>({
  kind:'moviehub-youtube-g2-nightly-budgeted-discovery',
  ...data,independentlyVerifiedDEOffers:0,publicationPermitted:false,
  publishedPlaybackRoutes:0,firestoreWrites:0,providerWrites:0,
  catalogWrites:0,badgeWrites:0,
})

export async function runRealQuotaNightly({
  publicIndex,bucket,tmdbGet,youtubeApi,runId,
  now=()=>new Date().toISOString(),wait=sleep,
}={}){
  const start=now(),day=pacificSearchDay(start)
  let progress=await loadNightlyQueue(bucket)
  let candidates=await loadDurableCandidateCheckpoint(bucket)
  if(!candidates.checkpoint)
    throw Error('G2_NIGHTLY_PRIVATE_CANDIDATES_NOT_BOOTSTRAPPED')
  const plan=selectNightlyPublicBadgeMovies({
    publicIndex,checkpoint:candidates.checkpoint,progress:progress.queue,
    now:start,limit:REAL_QUOTA_MAX_PREFLIGHT_FILMS,
  })
  const base={
    pacificDate:day.date,dayLimit:null,
    quotaMode:'google-enforced-no-internal-daily-cap',
    priorReserved:null,googleProjectRemaining:null,
    quotaExceededConfirmed:false,successfulSearchCalls:0,
    selectedForSearch:0,searchCalls:0,rateLimitResponses:0,
    uncertainSearchAttempts:0,videoDetailCalls:0,
    publicBadgeFilms:plan.totalPublicBadgeMovies,
    previouslyKnownVideoFilms:plan.knownCandidateMovies,
    stillEligible:plan.pendingMovies,checkedNoOffer:0,
    savedNewCandidateFilms:0,finishedWithoutCandidates:0,
    terminationReason:null,
  }
  if(!plan.movieIds.length)
    return protectedResult({...base,status:'no-unknown-public-films'})

  let tmdbReads=0
  const guardedTmdb=async(path,params)=>{
    if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)
      ||++tmdbReads>1+4*REAL_QUOTA_MAX_PREFLIGHT_FILMS)
      throw Error('G2_NIGHTLY_TMDB_ENDPOINT_OR_BUDGET_EXCEEDED')
    return tmdbGet(path,params)
  }
  const directory=await guardedTmdb('/watch/providers/movie',{
    language:'de-DE',watch_region:'DE',
  })
  const youtubeProviders=exactYoutubeProviderIds(directory)
  if(!youtubeProviders.length)
    throw Error('G2_NIGHTLY_TMDB_YOUTUBE_PROVIDER_MISSING')
  const eligible=[],noOffer=[]
  for(const tmdbId of plan.movieIds){
    const snap=await guardedTmdb('/movie/'+tmdbId+'/watch/providers',{})
    if(exactDeYoutubeOfferTypes(snap,youtubeProviders).length)
      eligible.push(tmdbId)
    else noOffer.push(tmdbId)
  }
  if(noOffer.length){
    let doc=progress.queue
    for(const tmdbId of noOffer)
      doc=putNightlyResult(doc,{tmdbId,state:'no-current-offer',
        runId,now:now()})
    progress=await saveNightlyQueue(bucket,doc,{
      expectedGeneration:progress.generation,
    })
  }
  base.checkedNoOffer=noOffer.length
  if(!eligible.length)
    return protectedResult({...base,status:'no-current-offer-candidates'})

  let journal=await ensureSearchJournal(bucket,{now:now(),runId})
  if(journal.journal.state!=='running'){
    const done=journal.journal
    return protectedResult({...base,
      status:done.state==='quota-exhausted'
        ?'quota-exhausted-confirmed':done.state==='rate-limited'
          ?'rate-limited-stalled':'completed',
      quotaExceededConfirmed:done.state==='quota-exhausted',
      selectedForSearch:done.attempts,searchCalls:done.attempts,
      successfulSearchCalls:done.successful,rateLimitResponses:done.rateLimited,
      uncertainSearchAttempts:done.uncertain+done.pendingAttempts,
      rateLimitHttp429:done.rateLimitHttp429??0,
      rateLimitHttp403:done.rateLimitHttp403??0,
      rateLimitUnclassified:done.rateLimitUnclassified??0,
      rateLimitRetryAfterHints:done.rateLimitRetryAfterHints??0,
      rateLimitFirstAt:done.rateLimitFirstAt??null,
      rateLimitLastAt:done.rateLimitLastAt??null,
      terminationReason:done.state==='rate-limited'
        ?'youtube-search-rate-limit-not-confirmed-quota'
        :'prior-run-journal-already-final'})
  }
  // GitHub job reruns share their run ID. Any pre-crash in-flight call
  // remains accounted for as uncertain rather than being refunded.
  if(journal.journal.pendingAttempts)
    journal=await changeSearchJournal(bucket,journal,{
      now:now(),runId,event:'recover',
    })
  let lastSearchAt=null,adaptiveIntervalMs=REAL_QUOTA_MIN_SEARCH_INTERVAL_MS
  let retryCooldownDone=false
  let videoDetailCalls=0,savedNewCandidateFilms=0
  let finishedWithoutCandidates=0,completedFilms=0

  const search=async(endpoint,params)=>{
    if(endpoint==='videos'){
      ++videoDetailCalls
      if(videoDetailCalls>eligible.length)
        throw Error('G2_NIGHTLY_VIDEO_DETAILS_EXCEEDED')
      return youtubeApi(endpoint,params)
    }
    if(endpoint!=='search')
      throw Error('G2_NIGHTLY_YOUTUBE_ENDPOINT_FORBIDDEN')
    // A throttled or transient error may be retried; every network attempt is
    // individually journaled. A confirmed daily quota error is NEVER retried.
    for(let retry=0;retry<=REAL_QUOTA_MAX_RATE_LIMIT_RETRIES;retry++){
      if(pacificSearchDay(now()).date!==day.date)
        throw Error('G2_NIGHTLY_PACIFIC_DAY_CHANGED_MID_RUN')
      // A minute-scale retry cooldown already satisfies normal pacing.
      // Do not add the 5–30s adaptive interval on top of the hour schedule.
      if(lastSearchAt!==null&&!retryCooldownDone){
        const pause=Math.max(0,adaptiveIntervalMs-
          (Date.now()-lastSearchAt))
        if(pause>0)await wait(pause)
      }
      retryCooldownDone=false
      journal=await changeSearchJournal(bucket,journal,{
        now:now(),runId,event:'attempt',
      })
      lastSearchAt=Date.now()
      let answer,error
      try{answer=await youtubeApi(endpoint,params)}
      catch(e){error=e}
      journal=await changeSearchJournal(bucket,journal,{
        now:now(),runId,
        event:!error?'success':isQuota(error)?'quota':
          isRate(error)?'rate-limit':'failed',
        ...(isRate(error)?{rateLimitMeta:{
          httpStatus:error.youtubeHttpStatus,
          failureClass:error.youtubeFailureClass,
          retryAfterMs:error.retryAfterMs,
        }}:{}),
      })
      if(!error){
        // Gradually return to normal search speed only after real successes.
        adaptiveIntervalMs=Math.max(REAL_QUOTA_MIN_SEARCH_INTERVAL_MS,
          Math.floor(adaptiveIntervalMs*0.8))
        return answer
      }
      if(isRate(error)){
        adaptiveIntervalMs=Math.min(30000,
          Math.max(5000,adaptiveIntervalMs*2))
      }
      const maxRetries=isRate(error)
        ?REAL_QUOTA_MAX_RATE_LIMIT_RETRIES:REAL_QUOTA_MAX_TRANSIENT_RETRIES
      if((isRate(error)||isTemporary(error))&&retry<maxRetries){
        // The ten rate-limit attempts span 60 minutes without Retry-After.
        // A bounded, sanitized provider hint can extend an individual gap;
        // never fire an additional attempt earlier than Google recommends.
        const scheduled=isRate(error)
          ?REAL_QUOTA_RATE_RETRY_GAPS_MS[retry]
          :Math.min(16000,2000*2**retry)
        const retryAfter=isRate(error)&&Number.isSafeInteger(error.retryAfterMs)
          &&error.retryAfterMs>=0
          ?Math.min(error.retryAfterMs,REAL_QUOTA_RATE_RETRY_WINDOW_MS):0
        await wait(Math.max(scheduled,retryAfter))
        retryCooldownDone=isRate(error)
        continue
      }
      if(isRate(error)){
        // Drosselung ist nicht das gleiche wie eine erschöpfte Tagesquote.
        // Als Einschränkung beenden, ohne einen falschen Erfolg zu melden.
        journal=await changeSearchJournal(bucket,journal,{
          now:now(),runId,event:'rate-limited-stop',
        })
        throw Error('G2_NIGHTLY_RATE_LIMIT_STALLED')
      }
      throw error
    }
  }
  const report=(status,terminationReason)=>protectedResult({
    ...base,status,terminationReason,
    quotaExceededConfirmed:journal.journal.quotaRejected===1,
    selectedForSearch:journal.journal.attempts,
    searchCalls:journal.journal.attempts,
    successfulSearchCalls:journal.journal.successful,
    rateLimitResponses:journal.journal.rateLimited,
    uncertainSearchAttempts:journal.journal.uncertain+
      journal.journal.pendingAttempts,
    rateLimitHttp429:journal.journal.rateLimitHttp429??0,
    rateLimitHttp403:journal.journal.rateLimitHttp403??0,
    rateLimitUnclassified:journal.journal.rateLimitUnclassified??0,
    rateLimitRetryAfterHints:journal.journal.rateLimitRetryAfterHints??0,
    rateLimitFirstAt:journal.journal.rateLimitFirstAt??null,
    rateLimitLastAt:journal.journal.rateLimitLastAt??null,
    videoDetailCalls,checkedTmdbReads:tmdbReads,
    savedNewCandidateFilms,finishedWithoutCandidates,
    runCompletedFilms:completedFilms,
    runUnfinishedFilms:['quota-exhausted-confirmed',
      'rate-limited-stalled'].includes(status)?1:0,
  })
  for(const tmdbId of eligible){
    if(pacificSearchDay(now()).date!==day.date)
      throw Error('G2_NIGHTLY_PACIFIC_DAY_CHANGED_MID_RUN')
    progress=await saveNightlyQueue(bucket,putNightlyResult(progress.queue,{
      tmdbId,state:'started',runId,now:now(),
    }),{expectedGeneration:progress.generation})
    let pilot
    try{
      pilot=await runTmdbFirstLinkPilot({
        publicIndex,seedRefs:[{mediaType:'movie',tmdbId}],limit:1,
        knownDeviceCandidates:[],knownVideoCandidatesByTmdbId:new Map(),
        searchesPerUncachedMovie:1,now,
        tmdbGet:guardedTmdb,youtubeApi:search,
      })
    }catch(error){
      if(isQuota(error))
        return report('quota-exhausted-confirmed',
          'youtube-search-list-403-quotaExceeded')
      if(error?.message==='G2_NIGHTLY_RATE_LIMIT_STALLED')
        return report('rate-limited-stalled',
          'youtube-search-rate-limit-not-confirmed-quota')
      throw error
    }
    if(pilot.rows.length!==1||pilot.rows[0].tmdbId!==tmdbId
      ||pilot.summary.calls.youtubeSearches>1
      ||pilot.summary.calls.youtubeVideoLookups>1
      ||pilot.summary.publicationPermitted!==false
      ||pilot.summary.verifiedDirectLinks!==0
      ||pilot.rows[0].publicationPermitted!==false
      ||pilot.rows[0].directPlaybackRoute!==null
      ||pilot.rows[0].reviewedVideoId!==null
      ||pilot.summary.firestoreWrites!==0
      ||pilot.summary.providerWrites!==0
      ||pilot.summary.catalogWrites!==0
      ||pilot.summary.badgeWrites!==0)
      throw Error('G2_NIGHTLY_PILOT_UNSAFE')
    const row=pilot.rows[0]
    if(row.videoCandidates.length){
      const envelope={
        publicationPermitted:false,verifiedDEOffers:0,confirmedDirectLinks:0,
        catalogWrites:0,firestoreWrites:0,providerWrites:0,
        badgeWrites:0,nightlyWrites:0,
        plan:[{tmdbId}],batch:{selectedCount:1},
      }
      const merged=mergeCandidateCheckpoint(candidates.checkpoint,{
        plan:envelope,pilot,
      },{runId,now:now()})
      await saveDurableCandidateCheckpoint(bucket,merged.checkpoint,{
        expectedGeneration:candidates.generation,
      })
      candidates=await loadDurableCandidateCheckpoint(bucket)
      savedNewCandidateFilms+=merged.newMovies
    }else finishedWithoutCandidates++
    progress=await saveNightlyQueue(bucket,putNightlyResult(progress.queue,{
      tmdbId,state:row.videoCandidates.length?
        'known-candidate':'no-video-candidates',runId,now:now(),
    }),{expectedGeneration:progress.generation})
    completedFilms++
  }
  journal=await changeSearchJournal(bucket,journal,{
    now:now(),runId,event:'complete',
  })
  return report('completed','eligible-tmdb-film-candidates-exhausted')
}
