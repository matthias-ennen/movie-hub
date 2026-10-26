import {describe,it,expect,vi} from 'vitest'
import {evaluatePacificSearchBudget,RATE,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {
  assertFiveSearchPlan,assertFiveSearchAdmission,
  admitExactlyFiveYoutubeSearches,FIVE_SEARCH_RESERVATION_CALLS,
} from '../scripts/youtube-g2-five-search-admission.mjs'

const NOW='2026-10-25T18:00:00.000Z'
const plan=()=>({
  tmdbRefs:[201,202,203,204,205].map(tmdbId=>({mediaType:'movie',tmdbId})),
  maxSearchAttempts:5,publicationPermitted:false,
  monitoringRemainingQuotaMeasured:false,
})
const series={timeSeries:[{
  metric:{type:RATE,labels:{quota_metric:QUOTA}},
  resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
  points:[{
    interval:{
      startTime:'2026-10-25T17:49:00Z',
      endTime:'2026-10-25T17:50:00Z',
    },
    value:{int64Value:'15'},
  }],
}]}
const preflight=()=>evaluatePacificSearchBudget({
  now:NOW,rateHttp:200,rateResponse:series,
  exceededHttp:200,exceededResponse:{timeSeries:[]},
})
const bucket={name:'movie-hub-62459-nightly-checkpoints'}
const readback=runId=>({
  runId,reservationCalls:5,globalGoogleQuotaGuaranteed:false,
  automaticallyCallYoutube:false,youtubeSearchCallsPerformed:0,
  providerWrites:0,
})

describe('five-search manual research shares the ONE-search Pacific GCS ledger',()=>{
  it('requires exactly five unique, public, unapproved movie hypotheses',()=>{
    expect(assertFiveSearchPlan(plan())).toEqual([201,202,203,204,205])
    expect(FIVE_SEARCH_RESERVATION_CALLS).toBe(5)
    for(const change of [
      p=>{p.maxSearchAttempts=6},
      p=>{p.publicationPermitted=true},
      p=>{p.tmdbRefs[4].tmdbId=201},
      p=>{p.tmdbRefs[2].mediaType='series'},
      p=>{p.tmdbRefs.pop()},
      p=>{p.monitoringRemainingQuotaMeasured=true},
    ]){
      const bad=plan();change(bad)
      expect(()=>assertFiveSearchPlan(bad))
        .toThrow('G2_FIVE_SEARCH_BUDGET_PLAN_NOT_TRUSTED')
    }
  })
  it('reserves all five with the SAME ledger, pessimistically, before any video search',async()=>{
    const reserve=vi.fn(async(_bucket,request)=>readback(request.runId))
    const admitted=await admitExactlyFiveYoutubeSearches({
      plan:plan(),preflight:preflight(),now:NOW,runId:601111,bucket,reserve,
    })
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(reserve.mock.calls[0][0]).toBe(bucket)
    expect(reserve.mock.calls[0][1]).toMatchObject({
      runId:601111,calls:5,now:NOW,
    })
    expect(admitted).toMatchObject({
      runId:601111,tmdbIds:[201,202,203,204,205],
      source:'gcs-atomic-five-search-reservation',
      maximumSearchAttempts:5,internalReservationRecorded:true,
      quotaIsSharedAndNotGuaranteed:true,offerApproval:false,
    })
    expect(assertFiveSearchAdmission(admitted,plan())).toEqual(admitted)
  })
  it('never reserves if telemetry, movie plan or cloud context are invalid',async()=>{
    const reserve=vi.fn(async()=>readback(601200))
    const failed=preflight();failed.rate.units=99
    await expect(admitExactlyFiveYoutubeSearches({
      plan:plan(),preflight:failed,now:NOW,runId:601200,bucket,reserve,
    })).rejects.toThrow('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
    await expect(admitExactlyFiveYoutubeSearches({
      plan:plan(),preflight:preflight(),now:NOW,runId:0,bucket,reserve,
    })).rejects.toThrow('G2_FIVE_SEARCH_RESERVATION_CONTEXT_REQUIRED')
    await expect(admitExactlyFiveYoutubeSearches({
      plan:plan(),preflight:preflight(),now:NOW,runId:601200,
      bucket:{name:'other-bucket'},reserve,
    })).rejects.toThrow('G2_FIVE_SEARCH_RESERVATION_CONTEXT_REQUIRED')
    expect(reserve).not.toHaveBeenCalled()
  })
  it('rejects any partial, forged or non-CAS reservation readback',async()=>{
    for(const mismatch of [
      r=>{r.runId=1},
      r=>{r.reservationCalls=4},
      r=>{r.globalGoogleQuotaGuaranteed=true},
      r=>{r.automaticallyCallYoutube=true},
      r=>{r.youtubeSearchCallsPerformed=1},
      r=>{r.providerWrites=1},
    ]){
      const reserve=vi.fn(async()=>{
        const result=readback(601300);mismatch(result);return result
      })
      await expect(admitExactlyFiveYoutubeSearches({
        plan:plan(),preflight:preflight(),now:NOW,
        runId:601300,bucket,reserve,
      })).rejects.toThrow('G2_FIVE_SEARCH_GCS_RESERVATION_READBACK_INVALID')
    }
  })
})
