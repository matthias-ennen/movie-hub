import {describe,it,expect} from 'vitest'
import {previewCoordinatedBootstrapBatch,PREVIEW_KIND}
  from '../scripts/youtube-g2-safe-next-batch-preview.mjs'
import {createYoutubeFullCatalogResearchPlan}
  from '../scripts/youtube-g2-full-catalog-queue.mjs'
import {advanceCompletedBootstrapQa}
  from '../scripts/youtube-g2-durable-bootstrap-progress.mjs'
import {evaluatePacificSearchBudget,RATE,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {prepareResearchReservation}
  from '../scripts/youtube-g2-atomic-search-budget-ledger.mjs'

const now='2026-10-25T18:00:00Z'
const kinds=['browse','personal-tmdb','profile-state','movie-hub','waipu','joyn']
const movies=Array.from({length:6},(_,i)=>({
  key:'movie:'+(i+1),type:'movie',tmdbId:i+1,
  sources:[i%2?'profile-state':'browse'],
}))
const inventory=()=>({
  kind:'title-candidate-inventory',schemaVersion:2,
  identity:'media-type+tmdb-id',
  generatedAt:'2026-10-25T16:00:00Z',
  policy:{candidateSources:kinds},
  sourceStats:Object.fromEntries(kinds.map(x=>[x,{eligibleReferences:0}])),
  counts:{canonicalCandidates:movies.length},candidates:structuredClone(movies),
})
const index=()=>({
  kind:'search-index',version:1,country:'DE',source:'published',
  generatedAt:'2026-10-25T16:15:00Z',
  count:6,
  entries:movies.map(x=>({
    type:'movie',tmdbId:x.tmdbId,title:'Demo Film '+x.tmdbId,
    year:2000,providerIds:['youtube'],
    providerOffers:[{id:'youtube',offerTypes:['free']}],
  })),
})
const known=()=>new Map([[1,['Abc12345678']]])
function preflight(){
  return evaluatePacificSearchBudget({
    now,rateHttp:200,
    rateResponse:{timeSeries:[{
      metric:{type:RATE,labels:{quota_metric:QUOTA}},
      resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
      points:[{
        interval:{
          startTime:'2026-10-25T17:49:00Z',
          endTime:'2026-10-25T17:50:00Z',
        },value:{int64Value:'15'},
      }],
    }]},
    exceededHttp:200,exceededResponse:{timeSeries:[]},
  })
}
const input=()=>({
  inventory:inventory(),publicIndex:index(),knownVideoCandidatesByTmdbId:known(),
  preflight:preflight(),runId:700101,now,
})
function completedInitial(){
  const i=input()
  const plan=createYoutubeFullCatalogResearchPlan({
    inventory:i.inventory,publicIndex:i.publicIndex,limit:2,
    knownVideoCandidatesByTmdbId:i.knownVideoCandidatesByTmdbId,now,
  })
  const pilot={
    summary:{
      publicationPermitted:false,verifiedDirectLinks:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,
      badgeWrites:0,nightlyWrites:0,
      processedMovies:2,
      calls:{youtubeSearches:2},
      statusCounts:{'no-video-candidate':2},
    },
    rows:plan.plan.map(x=>({
      tmdbId:x.tmdbId,status:'no-video-candidate',
      directPlaybackRoute:null,publicationPermitted:false,
      verifiedDePlayback:false,
    })),
  }
  const qa={plan,pilot}
  const s=advanceCompletedBootstrapQa({
    qa,now,workflow:{
      runId:700100,sourceSha:'a'.repeat(40),
      verifiedCompletedSuccess:true,verifiedMainBranch:true,
      verifiedPrivateArtifact:true,
    },
  })
  return {qa,progress:s.progress}
}
describe('YouTube read-only coordinated bootstrap preview; NEVER grants quota',()=>{
  it('combines canonical sorted queue, existing candidate reuse, PT budget preview',()=>{
    const r=previewCoordinatedBootstrapBatch(input())
    expect(r).toMatchObject({
      kind:PREVIEW_KIND,startOffset:0,nextOffsetIfSuccessful:5,
      totalBadgeMovieCount:6,plannedFilmHypotheses:5,
      knownVideoCandidateMovieCount:1,
      searchesAvoidedByCandidateReuse:2,
      proposedNewSearchCalls:8,proposedInternalDayReservedAfter:8,
      pacificQuotaDay:'2026-10-25',
      actualProjectQuotaRemaining:null,
      preflightIsRealTimeQuotaGuarantee:false,
      externalProjectCallersCoordinated:false,
      durableReservationWritten:false,cursorAdvanced:false,
      automaticSearchEnabled:false,authorizedSearchCalls:0,
      youtubeApiCallsPerformed:0,verifiedGermanOffers:0,
      publishedPlaybackRoutes:0,firestoreWrites:0,providerWrites:0,
      privatePreview:true,publicationPermitted:false,
    })
    expect(r.sourceQueueDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(r.selectedPublicWorkDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(r)).not.toContain('Demo Film')
    expect(JSON.stringify(r)).not.toContain('Abc12345678')
  })
  it('previews exact next offset only after proven contiguous successful prior QA',()=>{
    const {qa,progress}=completedInitial()
    const r=previewCoordinatedBootstrapBatch({
      ...input(),runId:700102,
      progress,previousQa:qa,previousRunId:700100,
    })
    expect(r.startOffset).toBe(2)
    expect(r.plannedFilmHypotheses).toBe(4)
    expect(r.proposedNewSearchCalls).toBe(8)
    expect(r.nextOffsetIfSuccessful).toBe(null)
    expect(r.cursorAdvanced).toBe(false)
  })
  it('blocks quota, forged PT preflight, duplicate reservation and queue drift',()=>{
    const edits=[
      x=>{x.preflight.smallBatchAdvisory=false},
      x=>{x.preflight.currentQuotaRemaining=100},
      x=>{x.preflight.checkedAt='2026-10-25T00:00:00Z'},
      x=>{x.preflight.rate.units=90},
      x=>{x.preflight.blocks.push('quota-exceeded')},
      x=>{x.runId=-1},
      x=>{x.knownVideoCandidatesByTmdbId.set(3,['bad'])},
      x=>{x.publicIndex.count=999},
      x=>{x.publicIndex.generatedAt='2026-05-01T00:00:00Z'},
      x=>{x.publicIndex.country='US'},
    ]
    for(const edit of edits){
      const x=input();edit(x)
      expect(()=>previewCoordinatedBootstrapBatch(x)).toThrow()
    }
    const {qa,progress}=completedInitial()
    for(const edit of [
      x=>{x.previousRunId=800001},
      x=>{x.previousQa.plan.batch.offset=1},
      x=>{x.progress.queueIdentity='b'.repeat(64)},
      x=>{x.progress.nextOffset=5},
      x=>{x.publicIndex.entries[0].providerIds=[];x.publicIndex.entries[0].providerOffers=[]},
      x=>{x.previousQa=null},
    ]){
      const x={
        ...input(),runId:700102,progress:structuredClone(progress),
        previousQa:structuredClone(qa),previousRunId:700100,
      }
      edit(x)
      expect(()=>previewCoordinatedBootstrapBatch(x)).toThrow()
    }
  })
  it('blocks overspending internal quota, never refunds or writes',()=>{
    const x=input()
    x.existingDailyLedger=null
    const first=previewCoordinatedBootstrapBatch(x)
    expect(first.proposedInternalDayReservedAfter).toBe(8)
    const y=input()
    // Reserve once only in MEMORY to simulate another bounded research job.
    const dummy=prepareResearchReservation({
      now,runId:700099,calls:4,preflight:preflight(),
    })
    y.existingDailyLedger=dummy.ledger
    expect(()=>previewCoordinatedBootstrapBatch(y))
      .toThrow('YOUTUBE_RESEARCH_INTERNAL_DAILY_CAP_EXHAUSTED')
  })
})
