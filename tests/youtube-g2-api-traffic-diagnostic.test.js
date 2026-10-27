import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  inspectYoutubeApiTraffic,TRAFFIC_KIND,TRAFFIC_METRIC,
} from '../scripts/youtube-g2-api-traffic-diagnostic.mjs'
const start='2026-10-26T12:00:00Z'
const end='2026-10-27T12:00:00Z'
function series({service='youtube.googleapis.com',
  project='movie-hub-62459',metric=TRAFFIC_METRIC,
  code='200',count='3',when='2026-10-27T11:00:00Z'}={}){
  return {
    metric:{type:metric,labels:{response_code:code,
      private_credential_id:'CREDENTIAL-DO-NOT-EXPOSE'}},
    resource:{type:'consumed_api',labels:{service,project_id:project,
      credential_id:'PRIVATE-CREDENTIAL-DO-NOT-EXPOSE',method:'search.list'}},
    points:[{interval:{startTime:'2026-10-27T10:59:00Z',endTime:when},
      value:{int64Value:count}}],
  }
}
const inspect=patch=>inspectYoutubeApiTraffic({
  http:200,start,end,document:{timeSeries:[series()]},...patch,
})
describe('YouTube API consumed request traffic telemetry is diagnostic only',()=>{
  it('reads completed request DELTA counts independently of quota budget',()=>{
    const report=inspect({document:{timeSeries:[
      series({count:'3'}),series({code:'403',count:'2'})]}})
    expect(report).toMatchObject({
      kind:TRAFFIC_KIND,shape:'timeSeries-present',series:2,points:2,
      observedCompletedRequests:5,latestSample:'2026-10-27T11:00:00.000Z',
      potentiallyDelayedMinutes:30,requestCountIsNotQuotaUnits:true,
      quotaRemaining:null,actualSearchListRequests:null,
      authorizedSearchCalls:0,youtubeApiCalls:0,gcsWrites:0,
      quotaWrites:0,publicationPermitted:false,
    })
    expect(JSON.stringify(report)).not.toContain('PRIVATE-CREDENTIAL')
    expect(JSON.stringify(report)).not.toContain('search.list')
  })
  it('distinguishes omitted, empty, paginated and HTTP-inaccessible responses',()=>{
    expect(inspect({document:{}})).toMatchObject({
      shape:'timeSeries-omitted',observedCompletedRequests:null})
    expect(inspect({document:{timeSeries:[]}})).toMatchObject({
      shape:'timeSeries-empty',observedCompletedRequests:0})
    expect(inspect({document:{timeSeries:[series()],nextPageToken:'secret'}}))
      .toMatchObject({shape:'paginated-unknown',observedCompletedRequests:null})
    expect(inspect({document:{timeSeries:[series()],
      executionErrors:[{message:'DO-NOT-LOG'}]}}))
      .toMatchObject({shape:'incomplete-execution-unknown',observedCompletedRequests:null})
    expect(inspect({document:{timeSeries:[series()],
      unreachable:['private-location']}}))
      .toMatchObject({shape:'incomplete-execution-unknown',observedCompletedRequests:null})
    expect(inspect({http:403,document:{message:'secret'}}))
      .toMatchObject({shape:'http-unavailable',observedCompletedRequests:null})
  })
  it('rejects wrong project, foreign service/metric, invalid point and oversized counts',()=>{
    const items=[
      series({service:'drive.googleapis.com'}),
      series({project:'another-project'}),
      series({metric:'serviceruntime.googleapis.com/other'}),
      series({count:'-10'}),
      series({count:'100000001'}),
      series({when:'2026-10-30T11:00:00Z'}),
    ]
    for(const entry of items){
      const r=inspect({document:{timeSeries:[entry]}})
      expect(['unexpected-series','invalid-point','count-overflow']).toContain(r.shape)
      expect(r.observedCompletedRequests).toBeNull()
      expect(r.authorizedSearchCalls).toBe(0)
    }
  })
  it('rejects unbounded windows and non-numeric timestamps',()=>{
    expect(()=>inspectYoutubeApiTraffic({http:200,start:'invalid',end,document:{}}))
      .toThrow('INVALID_TRAFFIC_DIAGNOSTIC_WINDOW')
    expect(()=>inspectYoutubeApiTraffic({
      http:200,start:'2026-10-01T00:00:00Z',end,document:{},
    })).toThrow('INVALID_TRAFFIC_DIAGNOSTIC_WINDOW')
  })
  it('preserves unchanged fail-closed nighttime quota preflight and no automatic runs',()=>{
    const nightly=readFileSync(new URL(
      '../.github/workflows/youtube-g2-nightly-discovery.yml',import.meta.url),'utf8')
    const wf=readFileSync(new URL(
      '../.github/workflows/youtube-g2-pacific-search-preflight.yml',
      import.meta.url),'utf8')
    expect(nightly).toContain('node scripts/youtube-g2-nightly-discovery-live.mjs')
    expect(nightly).toContain('node scripts/youtube-g2-pacific-search-preflight.mjs')
    expect(wf).toContain('api/request_count')
    expect(wf).toContain('scripts/youtube-g2-api-traffic-diagnostic.mjs')
    expect(wf).toContain('api-traffic.json')
    expect(wf).toContain("github.event_name == 'workflow_dispatch'")
    expect(wf).not.toContain('youtube-g2-nightly-discovery-live.mjs')
  })
})
