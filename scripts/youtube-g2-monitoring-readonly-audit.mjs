/**
 * Read-only Cloud Monitoring audit of YouTube search quota usage signals.
 * No credentials, raw response bodies, per-user data, or production writes
 * may appear in the durable output. Missing Cloud Monitoring data is NOT
 * proof of zero actual API usage.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export const YT_SEARCH_QUOTA='youtube.googleapis.com/search_list'
const METRICS={
  rate:'serviceruntime.googleapis.com/quota/rate/net_usage',
  exceeded:'serviceruntime.googleapis.com/quota/exceeded',
}
const HTTP=new Set([0,200,400,401,403,404,429,500,502,503,504])
function validateHttp(http,response){
  if(!Number.isInteger(http)||!HTTP.has(http))
    throw Error('YOUTUBE_MONITORING_INVALID_HTTP')
  if(http!==200)return null
  if(response===null||typeof response!=='object'||Array.isArray(response))
    throw Error('YOUTUBE_MONITORING_INVALID_BODY')
  if(response.timeSeries!==undefined&&!Array.isArray(response.timeSeries))
    throw Error('YOUTUBE_MONITORING_SERIES_INVALID')
  return response
}
function measure(key,http,response,window){
  const data=validateHttp(http,response)
  const summary={
    http,availability:data===null?'not-readable'
      :data.nextPageToken?'partial-page'
        :!Array.isArray(data.timeSeries)?'missing-series-field'
          :!data.timeSeries.length?'no-reported-series':'has-reported-series',
    series:0,observedPoints:0,
    observedDeltaSum:key==='rate'?'0':null,
    trueExceededSamples:key==='exceeded'?0:null,
    sampleMin:null,sampleMax:null,
  }
  if(!data?.timeSeries)return summary
  if(data.timeSeries.length>100)throw Error('YOUTUBE_MONITORING_TOO_MANY_SERIES')
  let count=0n
  for(const series of data.timeSeries){
    if(series?.metric?.type!==METRICS[key]
      ||series.metric?.labels?.quota_metric!==YT_SEARCH_QUOTA
      ||series.resource?.type!=='consumer_quota'
      ||series.resource?.labels?.service!=='youtube.googleapis.com'
      ||!Array.isArray(series.points)||series.points.length>5000)
      throw Error('YOUTUBE_MONITORING_FOREIGN_SERIES')
    summary.series++
    for(const point of series.points){
      const start=Date.parse(point?.interval?.startTime??point?.interval?.endTime)
      const end=Date.parse(point?.interval?.endTime)
      if(!Number.isFinite(start)||!Number.isFinite(end)
        ||end<start||start<window.from-60000||end>window.to+60000)
        throw Error('YOUTUBE_MONITORING_BAD_TIME_SERIES_WINDOW')
      summary.observedPoints++
      const val=point?.value
      if(key==='rate'){
        if(!/^\d{1,18}$/.test(String(val?.int64Value??'')))
          throw Error('YOUTUBE_MONITORING_NONNEGATIVE_DELTA_REQUIRED')
        count+=BigInt(val.int64Value)
      }else{
        if(typeof val?.boolValue!=='boolean')
          throw Error('YOUTUBE_MONITORING_BOOLEAN_GAUGE_REQUIRED')
        if(val.boolValue)summary.trueExceededSamples++
      }
      const startISO=new Date(start).toISOString(),endISO=new Date(end).toISOString()
      if(summary.sampleMin===null||startISO<summary.sampleMin)summary.sampleMin=startISO
      if(summary.sampleMax===null||endISO>summary.sampleMax)summary.sampleMax=endISO
    }
  }
  if(key==='rate')summary.observedDeltaSum=count.toString()
  return summary
}
export function summarizeYoutubeSearchMonitoring({
  from,to,rateHttp,rateResponse,exceededHttp,exceededResponse,
}={}){
  const start=Date.parse(from),end=Date.parse(to)
  if(!Number.isFinite(start)||!Number.isFinite(end)
    ||start>=end||end-start>72*3600000
    ||end-start<3600000)
    throw Error('YOUTUBE_MONITORING_INVALID_TIME_RANGE')
  const window={from:start,to:end}
  const rate=measure('rate',rateHttp,rateResponse,window)
  const exceeded=measure('exceeded',exceededHttp,exceededResponse,window)
  return {
    kind:'moviehub-youtube-g2-readonly-search-monitoring',
    project:'movie-hub-62459',service:'youtube.googleapis.com',
    quotaMetric:YT_SEARCH_QUOTA,windowFrom:new Date(start).toISOString(),
    windowTo:new Date(end).toISOString(),
    rate,exceeded,
    // Even complete point coverage is not proof of the effective limiter
    // or of CURRENT remaining YouTube API query capacity.
    actualRemainingSearchCalls:null,
    exact429Cause:'not-established',
    proofOfZeroUsage:false,
    searchAutomaticallyAllowed:false,
    youtubeApiRequests:0,quotaChanges:0,monitoringChanges:0,
    firestoreWrites:0,privateArtifact:true,publicationPermitted:false,
  }
}
export function searchMonitoringMarkdown(s){
  if(s?.kind!=='moviehub-youtube-g2-readonly-search-monitoring'
    ||s.project!=='movie-hub-62459'||s.quotaMetric!==YT_SEARCH_QUOTA
    ||s.actualRemainingSearchCalls!==null||s.exact429Cause!=='not-established'
    ||s.proofOfZeroUsage!==false||s.searchAutomaticallyAllowed!==false
    ||s.youtubeApiRequests!==0||s.quotaChanges!==0
    ||s.monitoringChanges!==0||s.firestoreWrites!==0
    ||s.publicationPermitted!==false||s.privateArtifact!==true)
    throw Error('YOUTUBE_MONITORING_REPORT_UNSAFE')
  return [
    '# MovieHub YouTube – beobachtbare Google Cloud Monitoring Quota-Signale',
    '',
    '- Gemessener Zeitraum: '+s.windowFrom+' bis '+s.windowTo,
    '- API: '+s.service+'; Quota: '+s.quotaMetric,
    '- rate/net_usage: HTTP '+s.rate.http+'; '+s.rate.availability+
      '; Serien '+s.rate.series+'; Werte '+s.rate.observedPoints,
    '- Summe **beobachteter**, nicht garantierter Delta-Einheiten: '+s.rate.observedDeltaSum,
    '- quota/exceeded: HTTP '+s.exceeded.http+'; '+s.exceeded.availability+
      '; Serien '+s.exceeded.series+'; Werte '+s.exceeded.observedPoints,
    '- quota/exceeded-Werte TRUE im beobachteten Zeitfenster: '+s.exceeded.trueExceededSamples,
    '- Ein fehlender Messwert ist **kein** Beweis fuer 0 API-Requests, kein Restkontingent und keine 429-Ursache.',
    '- Bei unvollstaendigen Seiten oder fehlendem Zugriff ist eine Auswertung ausschliesslich eine Teilbeobachtung.',
    '- **0 neue YouTube-API-Aufrufe, 0 Rechte-/Quota-Aenderungen, 0 Anbieter-/Katalog-/Firestorewrites.**',
    '',
  ].join('\n')
}
export async function runMonitoringReadOnly({
  from,to,rateHttp,ratePath,exceededHttp,exceededPath,output,
}={}){
  if(!ratePath||!exceededPath||!output||process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('YOUTUBE_MONITORING_READONLY_INPUTS_REQUIRED')
  const load=async(code,path)=>Number(code)===200
    ?JSON.parse(await readFile(path,'utf8')):null
  const summary=summarizeYoutubeSearchMonitoring({
    from,to,rateHttp:Number(rateHttp),
    rateResponse:await load(rateHttp,ratePath),
    exceededHttp:Number(exceededHttp),
    exceededResponse:await load(exceededHttp,exceededPath),
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/summary.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',searchMonitoringMarkdown(summary)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify({
    kind:summary.kind,windowFrom:summary.windowFrom,windowTo:summary.windowTo,
    rate:summary.rate,exceeded:summary.exceeded,
    exact429Cause:summary.exact429Cause,youtubeApiRequests:summary.youtubeApiRequests,
  }))
  return summary
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runMonitoringReadOnly({
    from:process.argv[2],to:process.argv[3],
    rateHttp:process.argv[4],ratePath:process.argv[5],
    exceededHttp:process.argv[6],exceededPath:process.argv[7],
    output:process.argv[8],
  }).catch(e=>{console.error('YOUTUBE_MONITORING_READONLY_FAIL_CLOSED: '+e.message);process.exitCode=1})
}
