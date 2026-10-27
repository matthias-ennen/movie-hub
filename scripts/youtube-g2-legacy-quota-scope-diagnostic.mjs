/**
 * Read-only comparison of narrow/broad legacy Cloud Monitoring quota series.
 * Response shape is telemetry, not a remaining-quota guarantee or API permit.
 * Never print raw labels, HTTP bodies, film/video IDs, secrets or private GCS.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'

export const SEARCH_QUOTA='youtube.googleapis.com/search_list'
export const LEGACY_METRICS=Object.freeze({
  rate:'serviceruntime.googleapis.com/quota/rate/net_usage',
  exceeded:'serviceruntime.googleapis.com/quota/exceeded',
})
const SERVICE='youtube.googleapis.com'
const SHAPE_LIMIT=100
const POINT_LIMIT=5000

/** Invalid or missing metrics are UNKNOWN, never treated as zero usage. */
export function inspectLegacySeries({http,document,metric,scope=false}={}){
  if(!Object.values(LEGACY_METRICS).includes(metric))
    throw Error('UNKNOWN_QUOTA_METRIC')
  const result={http:Number.isInteger(http)&&http>=100&&http<=599?http:null,
    shape:'http-unavailable',series:null,targetSeries:null,points:null,
    latestSample:null,hasMorePages:null}
  if(result.http!==200)return result
  if(!document||typeof document!=='object'||Array.isArray(document)){
    result.shape='invalid-response'
    return result
  }
  result.hasMorePages=typeof document.nextPageToken==='string'
    &&document.nextPageToken.length>0
  if(!Object.hasOwn(document,'timeSeries')){
    result.shape='timeSeries-omitted'
    return result
  }
  if(!Array.isArray(document.timeSeries)||document.timeSeries.length>SHAPE_LIMIT){
    result.shape='invalid-series'
    return result
  }
  if(result.hasMorePages){
    result.shape='paginated-unknown'
    return result
  }
  let count=0,target=0,points=0,latest=null
  for(const entry of document.timeSeries){
    if(entry?.metric?.type!==metric
      ||entry?.resource?.type!=='consumer_quota'
      ||entry?.resource?.labels?.service!==SERVICE
      ||typeof entry?.metric?.labels?.quota_metric!=='string'
      ||!Array.isArray(entry.points)||entry.points.length>POINT_LIMIT){
      result.shape='unexpected-series'
      return result
    }
    const isTarget=entry.metric.labels.quota_metric===SEARCH_QUOTA
    // A narrow query must never silently accept an unrelated quota series.
    if(!scope&&!isTarget){
      result.shape='foreign-quota-in-narrow-query'
      return result
    }
    count++
    if(isTarget)target++
    for(const pt of entry.points){
      const t=Date.parse(pt?.interval?.endTime)
      const validValue=metric===LEGACY_METRICS.rate
        ?typeof pt?.value?.int64Value==='string'
          &&/^\d{1,14}$/.test(pt.value.int64Value)
        :typeof pt?.value?.boolValue==='boolean'
      if(!Number.isFinite(t)||!validValue){
        result.shape='invalid-point'
        return result
      }
      const iso=new Date(t).toISOString()
      if(latest===null||iso>latest)latest=iso
      points++
    }
  }
  result.shape=count===0?'timeSeries-empty':'timeSeries-present'
  result.series=count
  result.targetSeries=target
  result.points=points
  result.latestSample=latest
  return result
}

export function compareLegacyQuotaSeries({
  rateHttp,rateDoc,rateScopeHttp,rateScopeDoc,
  exceededHttp,exceededDoc,exceededScopeHttp,exceededScopeDoc,
}={}){
  const rate=inspectLegacySeries({
    http:rateHttp,document:rateDoc,metric:LEGACY_METRICS.rate})
  const rateScope=inspectLegacySeries({
    http:rateScopeHttp,document:rateScopeDoc,
    metric:LEGACY_METRICS.rate,scope:true})
  const exceeded=inspectLegacySeries({
    http:exceededHttp,document:exceededDoc,
    metric:LEGACY_METRICS.exceeded})
  const exceededScope=inspectLegacySeries({
    http:exceededScopeHttp,document:exceededScopeDoc,
    metric:LEGACY_METRICS.exceeded,scope:true})
  return {
    kind:'moviehub-youtube-g2-legacy-quota-scope-readonly',
    rate,rateScope,exceeded,exceededScope,
    // A missing exceeded time series is NOT proof of zero quota failures.
    rateFilterMayHideTarget:rate.targetSeries===0
      &&rateScope.targetSeries!==null&&rateScope.targetSeries>0,
    exceededFilterMayHideTarget:exceeded.targetSeries===0
      &&exceededScope.targetSeries!==null&&exceededScope.targetSeries>0,
    anyTargetRateObserved:rate.targetSeries!==null&&rate.targetSeries>0,
    anyTargetExceededObserved:exceeded.targetSeries!==null
      &&exceeded.targetSeries>0,
    currentRemainingQuota:null,measuredActualSearchCalls:null,
    authorizedSearchCalls:0,youtubeApiCalls:0,gcsWrites:0,
    publicationPermitted:false,quotaWrites:0,
  }
}

export async function writeLegacyQuotaDiagnostic({
  files,statuses,output,
}={}){
  if(!Array.isArray(files)||files.length!==4
    ||!Array.isArray(statuses)||statuses.length!==4
    ||!output||process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('READONLY_DIAGNOSTIC_INPUT_REQUIRED')
  const docs=await Promise.all(files.map(async(file,i)=>{
    if(Number(statuses[i])!==200)return null
    try{return JSON.parse(await readFile(file,'utf8'))}
    catch{return null}
  }))
  const result=compareLegacyQuotaSeries({
    rateHttp:Number(statuses[0]),rateDoc:docs[0],
    exceededHttp:Number(statuses[1]),exceededDoc:docs[1],
    rateScopeHttp:Number(statuses[2]),rateScopeDoc:docs[2],
    exceededScopeHttp:Number(statuses[3]),exceededScopeDoc:docs[3],
  })
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{mode:0o600})
  // Deliberately output only safe shapes/counts; never dump input documents.
  console.log(JSON.stringify(result))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const a=process.argv.slice(2)
  writeLegacyQuotaDiagnostic({
    statuses:[a[0],a[2],a[4],a[6]],
    files:[a[1],a[3],a[5],a[7]],output:a[8],
  }).catch(()=>{console.error('LEGACY_QUOTA_DIAGNOSTIC_FAILED_CLOSED');process.exitCode=1})
}
