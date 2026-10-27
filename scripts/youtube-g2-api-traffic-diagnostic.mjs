/**
 * Read-only, privacy-safe diagnostic of Google Cloud Monitoring's
 * serviceruntime.googleapis.com/api/request_count metric for consumed_api.
 *
 * This API traffic metric is independent of YouTube quota series. Its
 * observations may lag up to 30 minutes, and a missing series is UNKNOWN.
 * Never derive remaining quota or authorization for search.list from it.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'

export const TRAFFIC_METRIC='serviceruntime.googleapis.com/api/request_count'
export const TRAFFIC_KIND='moviehub-youtube-g2-api-traffic-readonly'
const MAX_SERIES=100
const MAX_POINTS=2500
const MAX_REQUESTS=100000000
const matchCount=v=>typeof v==='string'&&/^\d{1,12}$/.test(v)

export function inspectYoutubeApiTraffic({
  http,document,start,end,
}={}){
  const status=Number(http)
  const from=Date.parse(start),until=Date.parse(end)
  if(!Number.isFinite(from)||!Number.isFinite(until)
    ||from>=until||until-from>26*60*60*1000)
    throw Error('INVALID_TRAFFIC_DIAGNOSTIC_WINDOW')
  const result={
    kind:TRAFFIC_KIND,windowStart:new Date(from).toISOString(),
    windowEnd:new Date(until).toISOString(),
    metric:TRAFFIC_METRIC,httpStatus:Number.isInteger(status)
      &&status>=100&&status<=599?status:null,
    shape:'http-unavailable',series:null,points:null,
    observedCompletedRequests:null,latestSample:null,
    potentiallyDelayedMinutes:30,requestCountIsNotQuotaUnits:true,
    quotaRemaining:null,actualSearchListRequests:null,
    authorizedSearchCalls:0,youtubeApiCalls:0,gcsWrites:0,
    quotaWrites:0,publicationPermitted:false,
  }
  if(status!==200)return result
  if(!document||typeof document!=='object'||Array.isArray(document)){
    result.shape='invalid-response'
    return result
  }
  // timeSeries.list can return HTTP 200 with partial execution errors.
  // Such replies cannot support a complete traffic total.
  if(Array.isArray(document.executionErrors)&&document.executionErrors.length
    ||Array.isArray(document.unreachable)&&document.unreachable.length){
    result.shape='incomplete-execution-unknown'
    return result
  }
  if(!Object.hasOwn(document,'timeSeries')){
    result.shape='timeSeries-omitted'
    return result
  }
  if(!Array.isArray(document.timeSeries)
    ||document.timeSeries.length>MAX_SERIES){
    result.shape='invalid-series'
    return result
  }
  if(document.nextPageToken){
    result.shape='paginated-unknown'
    return result
  }
  let count=0,points=0,latest=null
  for(const series of document.timeSeries){
    if(series?.metric?.type!==TRAFFIC_METRIC
      ||series?.resource?.type!=='consumed_api'
      ||series?.resource?.labels?.service!=='youtube.googleapis.com'
      ||series?.resource?.labels?.project_id!=='movie-hub-62459'
      ||!Array.isArray(series.points)
      ||series.points.length>MAX_POINTS){
      result.shape='unexpected-series'
      return result
    }
    for(const point of series.points){
      const endAt=Date.parse(point?.interval?.endTime)
      const beginAt=point?.interval?.startTime
        ?Date.parse(point.interval.startTime):endAt
      const raw=point?.value?.int64Value
      if(!Number.isFinite(beginAt)||!Number.isFinite(endAt)
        ||endAt<=from||endAt>until||beginAt>endAt
        ||!matchCount(raw)){
        result.shape='invalid-point'
        return result
      }
      count+=Number(raw)
      if(!Number.isSafeInteger(count)||count>MAX_REQUESTS){
        result.shape='count-overflow'
        return result
      }
      points++
      if(latest===null||endAt>latest)latest=endAt
    }
  }
  result.shape=document.timeSeries.length
    ?'timeSeries-present':'timeSeries-empty'
  result.series=document.timeSeries.length
  result.points=points
  result.observedCompletedRequests=count
  result.latestSample=latest===null?null:new Date(latest).toISOString()
  return result
}
export async function runTrafficDiagnostic({
  start,end,http,input,output,
}={}){
  if(!input||!output||process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('TRAFFIC_DIAGNOSTIC_READONLY_REQUIRED')
  let document=null
  if(Number(http)===200){
    try{document=JSON.parse(await readFile(input,'utf8'))}
    catch{document=null}
  }
  const report=inspectYoutubeApiTraffic({http:Number(http),document,start,end})
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  // Never log raw method labels, credential IDs, response bodies, secrets.
  console.log(JSON.stringify(report))
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runTrafficDiagnostic({
    start:process.argv[2],end:process.argv[3],http:process.argv[4],
    input:process.argv[5],output:process.argv[6],
  }).catch(()=>{console.error('YOUTUBE_API_TRAFFIC_READONLY_FAILED_CLOSED');process.exitCode=1})
}
