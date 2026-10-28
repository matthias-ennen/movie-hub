import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  inspectYoutubeApiTraffic,TRAFFIC_KIND,TRAFFIC_METRIC,
} from '../scripts/youtube-g2-api-traffic-diagnostic.mjs'
const start='2026-10-26T12:00:00Z'
const end='2026-10-27T12:00:00Z'
function series({service='youtube.googleapis.com',
  project='movie-hub-62459',metric=TRAFFIC_METRIC,
  code='200',count='3',when='2026-10-27T11:00:00Z',
  method='search.list',credential='PRIVATE-CREDENTIAL-DO-NOT-EXPOSE'}={}){
  return {
    metric:{type:metric,labels:{response_code:code,
      private_credential_id:'CREDENTIAL-DO-NOT-EXPOSE'}},
    resource:{type:'consumed_api',labels:{service,project_id:project,
      credential_id:credential,method}},
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
      observedSearchMethodRequests:5,observedOtherMethodRequests:0,
      unclassifiedMethodRequests:0,methodLabelsPresentForAllSeries:true,
      distinctCredentialGroupsObserved:1,
      externalConsumersFullyAccountedFor:false,
      authorizedSearchCalls:0,youtubeApiCalls:0,gcsWrites:0,
      quotaWrites:0,publicationPermitted:false,
    })
    expect(JSON.stringify(report)).not.toContain('PRIVATE-CREDENTIAL')
    expect(JSON.stringify(report)).not.toContain('search.list')
  })
  it('reports multiple observed credential groups but never exposes their identities',()=>{
    const data={timeSeries:[
      series({credential:'KEY-ONE',count:'4'}),
      series({credential:'KEY-TWO',method:'videos.list',count:'8'}),
      series({credential:'KEY-ONE',code:'429',count:'2'}),
    ]}
    const r=inspect({document:data})
    expect(r).toMatchObject({
      observedCompletedRequests:14,observedSearchMethodRequests:6,
      observedOtherMethodRequests:8,unclassifiedMethodRequests:0,
      methodLabelsPresentForAllSeries:true,
      distinctCredentialGroupsObserved:2,
      externalConsumersFullyAccountedFor:false,
      actualSearchListRequests:null,quotaRemaining:null,
      authorizedSearchCalls:0,
    })
    expect(JSON.stringify(r)).not.toContain('KEY-ONE')
    expect(JSON.stringify(r)).not.toContain('KEY-TWO')
    expect(JSON.stringify(r)).not.toContain('videos.list')
  })
  it('does not equate absent method or credential labels with zero other consumers',()=>{
    const r=inspect({document:{timeSeries:[
      series({count:'1',credential:'KEY-ONE'}),
      series({count:'5',method:null,credential:null}),
      series({count:'2',method:'Unknown Method',credential:'KEY-TWO'}),
    ]}})
    expect(r).toMatchObject({
      shape:'timeSeries-present',observedCompletedRequests:8,
      observedSearchMethodRequests:1,observedOtherMethodRequests:0,
      unclassifiedMethodRequests:7,methodLabelsPresentForAllSeries:false,
      distinctCredentialGroupsObserved:null,
      externalConsumersFullyAccountedFor:false,
      actualSearchListRequests:null,quotaRemaining:null,
    })
    expect(JSON.stringify(r)).not.toContain('KEY-TWO')
    expect(JSON.stringify(r)).not.toContain('Unknown Method')
  })
  it('never turns an empty or truncated monitoring response into coverage proof',()=>{
    for(const document of [{timeSeries:[]},{},{
      timeSeries:[series()],nextPageToken:'PRIVATE-TOKEN'}]){
      const r=inspect({document})
      expect(r).toMatchObject({
        distinctCredentialGroupsObserved:null,
        observedSearchMethodRequests:null,
        unclassifiedLabelShapes:null,
        possibleSearchAmongUnknown:null,otherUnknownMethodRequests:null,
        actualSearchListRequests:null,
        methodLabelsPresentForAllSeries:false,
        externalConsumersFullyAccountedFor:false,
        quotaRemaining:null,authorizedSearchCalls:0,
      })
    }
  })
  it('recognizes public Google YouTube REST discovery IDs but never broad prefix guesses',()=>{
    const r=inspect({document:{timeSeries:[
      series({method:'youtube.search.list',count:'3'}),
      series({method:'youtube.videos.list',count:'5'}),
      series({method:'youtube.playlistItems.list',count:'7'}),
      series({method:'youtube.search.unknown',count:'11'}),
      series({method:'youtube.v3.SearchService.List',count:'13'}),
      series({method:'/youtube/v3/search',count:'17'}),
      series({method:'unrelated',count:'19'}),
    ]}})
    expect(r).toMatchObject({
      observedCompletedRequests:75,observedSearchMethodRequests:3,
      observedOtherMethodRequests:12,unclassifiedMethodRequests:60,
      unclassifiedLabelShapes:{
        missingOrInvalid:0,otherYoutubePrefixed:24,
        slashFormatted:17,otherDotted:0,other:19,
      },
      methodLabelsPresentForAllSeries:true,
      actualSearchListRequests:null,quotaRemaining:null,
      externalConsumersFullyAccountedFor:false,
    })
    const output=JSON.stringify(r)
    for(const raw of ['youtube.search.list','youtube.videos.list',
      'youtube.v3.SearchService.List','/youtube/v3/search','unrelated']){
      expect(output).not.toContain(raw)
    }
  })
  it('aggregates unknown search-like labels without treating them as confirmed calls',()=>{
    const r=inspect({document:{timeSeries:[
      series({method:'youtube.internal.SearchService.List',count:'7'}),
      series({method:'youtube.searchDiscovery.lookup',count:'3'}),
      series({method:'youtube.videoInternal.list',count:'11'}),
      series({method:'google.search.list',count:'5'}),
      series({method:'youtube.search.list',count:'2'}),
    ]}})
    expect(r).toMatchObject({
      observedCompletedRequests:28,
      observedSearchMethodRequests:2,
      unclassifiedMethodRequests:26,
      possibleSearchAmongUnknown:10,
      otherUnknownMethodRequests:16,
      actualSearchListRequests:null,
      quotaRemaining:null,
      externalConsumersFullyAccountedFor:false,
      authorizedSearchCalls:0,
    })
    const hidden=JSON.stringify(r)
    for(const label of ['SearchService','searchDiscovery','videoInternal',
      'google.search.list'])expect(hidden).not.toContain(label)
  })
  it('does not infer no searches from a fully unclassified method window',()=>{
    const r=inspect({document:{timeSeries:[
      series({method:'youtube.unmappedMethod',count:'223'}),
    ]}})
    expect(r).toMatchObject({
      observedCompletedRequests:223,observedSearchMethodRequests:0,
      unclassifiedMethodRequests:223,possibleSearchAmongUnknown:0,
      otherUnknownMethodRequests:223,
      actualSearchListRequests:null,quotaRemaining:null,
      externalConsumersFullyAccountedFor:false,
    })
  })
  it('provides only aggregate shape hints for missing and unfamiliar labels',()=>{
    const r=inspect({document:{timeSeries:[
      series({method:'google.internal.Request',count:'2'}),
      series({method:null,count:'5'}),
      series({method:'https://youtube.googleapis.com/v3/search',count:'9'}),
    ]}})
    expect(r).toMatchObject({
      unclassifiedMethodRequests:16,
      unclassifiedLabelShapes:{
        missingOrInvalid:5,otherYoutubePrefixed:0,
        slashFormatted:9,otherDotted:2,other:0,
      },
      observedSearchMethodRequests:0,
      methodLabelsPresentForAllSeries:false,
    })
    const redacted=JSON.stringify(r)
    expect(redacted).not.toContain('google.internal.Request')
    expect(redacted).not.toContain('https://')
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
  it('keeps read-only quota telemetry separate from trusted real-quota nightly discovery',()=>{
    const nightly=readFileSync(new URL(
      '../.github/workflows/youtube-g2-nightly-discovery.yml',import.meta.url),'utf8')
    const wf=readFileSync(new URL(
      '../.github/workflows/youtube-g2-pacific-search-preflight.yml',
      import.meta.url),'utf8')
    expect(nightly).toContain('node scripts/youtube-g2-nightly-discovery-live.mjs')
    expect(nightly).not.toContain('node scripts/youtube-g2-pacific-search-preflight.mjs')
    expect(nightly).toContain('quotaExceeded')
    expect(nightly).toContain("[youtube-nightly-once]")
    expect(wf).toContain('api/request_count')
    expect(wf).toContain('scripts/youtube-g2-api-traffic-diagnostic.mjs')
    expect(wf).toContain('api-traffic.json')
    expect(wf).toContain('observed(report.observedSearchMethodRequests)')
    expect(wf).toContain('observed(report.possibleSearchAmongUnknown)')
    expect(wf).toContain('observed(report.otherUnknownMethodRequests)')
    expect(wf).toContain('report.possibleSearchAmongUnknown+report.otherUnknownMethodRequests')
    expect(wf).toContain('report.unclassifiedLabelShapes')
    expect(wf).toContain('observed(report.distinctCredentialGroupsObserved)')
    expect(wf).toContain('report.externalConsumersFullyAccountedFor!==false')
    expect(wf).toContain('report.actualSearchListRequests!==null')
    expect(wf).toContain('report.authorizedSearchCalls!==0')
    expect(wf).toContain('YOUTUBE_TRAFFIC_ACCOUNTING_NOT_SAFE')
    expect(wf).toContain("github.event_name == 'workflow_dispatch'")
    expect(wf).toContain('[youtube-pacific-budget-preflight-once]')
    expect(wf).not.toContain('youtube-g2-nightly-discovery-live.mjs')
  })
})
