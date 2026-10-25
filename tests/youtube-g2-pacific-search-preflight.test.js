import {describe,it,expect} from 'vitest'
import {
  pacificSearchDay,evaluatePacificSearchBudget,
  RATE,EXCEEDED,QUOTA,KIND,
} from '../scripts/youtube-g2-pacific-search-preflight.mjs'
const now='2026-10-25T18:00:00Z'
function series(metric,point){
  return {timeSeries:[{
    metric:{type:metric,labels:{quota_metric:QUOTA}},
    resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
    points:[point],
  }]}
}
const interval={
  startTime:'2026-10-25T17:49:00Z',
  endTime:'2026-10-25T17:50:00Z',
}
const args=()=>({
  now,rateHttp:200,exceededHttp:200,
  rateResponse:series(RATE,{interval,value:{int64Value:'15'}}),
  exceededResponse:{timeSeries:[]},
})
describe('Pacific-day YouTube search budget preflight without a search authorization',()=>{
  it('handles Pacific DST 23h/25h days and reset, not Berlin or UTC midnight',()=>{
    expect(pacificSearchDay(now)).toEqual({
      date:'2026-10-25',start:'2026-10-25T07:00:00.000Z',
      end:'2026-10-26T07:00:00.000Z',
    })
    expect(pacificSearchDay('2026-11-01T08:30:00Z')).toEqual({
      date:'2026-11-01',start:'2026-11-01T07:00:00.000Z',
      end:'2026-11-02T08:00:00.000Z',
    })
    expect(pacificSearchDay('2026-03-08T16:00:00Z')).toEqual({
      date:'2026-03-08',start:'2026-03-08T08:00:00.000Z',
      end:'2026-03-09T07:00:00.000Z',
    })
  })
  it('only advises conservative ten-call possibility, NEVER authorizes search or reports remaining',()=>{
    const r=evaluatePacificSearchBudget(args())
    expect(r).toMatchObject({
      kind:KIND,pacificDate:'2026-10-25',
      rate:{http:200,complete:true,series:1,points:1,units:15},
      exceeded:{http:200,complete:true,series:0,points:0,exceededTrue:0},
      monitoringSampleAgeMinutes:10,smallBatchAdvisory:true,blocks:[],
      measuredProjectDailyLimit:100,researchBudgetProposed:10,
      otherConsumersReserve:30,monitoringLagBuffer:10,
      currentQuotaRemaining:null,monitoringIsActualRemainingQuota:false,
      acquiredSharedReservation:false,authorizedSearchCalls:0,
      automaticSearchAllowed:false,youtubeSearchCalls:0,
      quotaWrites:0,firestoreWrites:0,providerWrites:0,
      privateArtifact:true,publicationPermitted:false,
    })
  })
  it('blocks exhausted usage, quota exceeded and stale/missing telemetry',()=>{
    for(const edit of [
      x=>{x.rateResponse.timeSeries[0].points[0].value.int64Value='99'},
      x=>{x.exceededResponse=series(EXCEEDED,{
        interval,value:{boolValue:true},
      })},
      x=>{x.rateResponse.timeSeries[0].points[0].interval={
        startTime:'2026-10-25T07:00:00Z',
        endTime:'2026-10-25T07:01:00Z',
      }},
      x=>{x.rateHttp=403;x.rateResponse={error:{message:'private token'}}},
      x=>{x.rateResponse={timeSeries:[]}},
      x=>{x.rateResponse.nextPageToken='private-pagination-token'},
    ]){
      const x=args();edit(x)
      const r=evaluatePacificSearchBudget(x)
      expect(r.smallBatchAdvisory).toBe(false)
      expect(r.authorizedSearchCalls).toBe(0)
      expect(r.currentQuotaRemaining).toBe(null)
      expect(JSON.stringify(r)).not.toContain('private')
    }
  })
  it('refuses forged project/metric, out of day sample, malformed value and future data',()=>{
    for(const edit of [
      x=>{x.rateResponse.timeSeries[0].metric.labels.quota_metric='drive.googleapis.com/other'},
      x=>{x.rateResponse.timeSeries[0].resource.labels.service='drive.googleapis.com'},
      x=>{x.rateResponse.timeSeries[0].points[0].value.int64Value='-5'},
      x=>{x.rateResponse.timeSeries[0].points[0].value.int64Value='secret'},
      x=>{x.rateResponse.timeSeries[0].points[0].interval.startTime='2026-10-25T06:59:00Z'},
      x=>{x.rateResponse.timeSeries[0].points[0].interval.endTime='2026-10-25T19:00:00Z'},
      x=>{x.exceededResponse=series(EXCEEDED,{
        interval,value:{int64Value:'1'},
      })},
    ]){
      const x=args();edit(x)
      expect(()=>evaluatePacificSearchBudget(x)).toThrow()
    }
  })
  it('never treats an early PT-day run as a complete fresh quota accounting',()=>{
    const x=args();x.now='2026-10-25T07:20:00Z'
    x.rateResponse.timeSeries[0].points[0].interval={
      startTime:'2026-10-25T07:00:00Z',
      endTime:'2026-10-25T07:10:00Z',
    }
    const r=evaluatePacificSearchBudget(x)
    expect(r.blocks).toContain('early-after-PT-reset')
    expect(r.smallBatchAdvisory).toBe(false)
    expect(r.automaticSearchAllowed).toBe(false)
  })
})
