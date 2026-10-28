/**
 * READ ONLY: inspect the SAME two YouTube search-quota Monitoring endpoints
 * as nightly discovery. Never calls youtube.googleapis.com/search or writes GCS.
 * Writes only allowlisted aggregate metadata, never raw Monitoring JSON,
 * project labels, authorization, video IDs or API error bodies.
 */
import {execFileSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  pacificSearchDay,evaluatePacificSearchBudget,monitoringResponseShape,
  RATE,EXCEEDED,QUOTA,
} from './youtube-g2-pacific-search-preflight.mjs'

const TYPES=Object.freeze([['rate',RATE],['exceeded',EXCEEDED]])
const output='artifacts/youtube-g2/monitoring-response-diagnostic'
const safeInteger=x=>Number.isSafeInteger(x)&&x>=0?x:null
const iso=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x))
  ?new Date(x).toISOString():null
const delay=ms=>new Promise(done=>setTimeout(done,ms))
const permittedHttp=x=>Number.isInteger(x)&&x>=100&&x<=599?x:null

/** Sanitized diagnostic response; no raw API data ever returned. */
export function summarizeResponse(http,body,metric){
  const shape=monitoringResponseShape(http,body)
  const series=Array.isArray(body?.timeSeries)?body.timeSeries:null
  const list=series?.length<=100?series:null
  const points=list?.flatMap(x=>Array.isArray(x.points)?x.points:[])??[]
  const times=points.map(x=>iso(x?.interval?.endTime)).filter(Boolean).sort()
  const quotedMetricOk=list!==null&&list?.every(s=>
    s?.metric?.type===metric &&
    s?.metric?.labels?.quota_metric===QUOTA &&
    s?.resource?.type==='consumer_quota' &&
    s?.resource?.labels?.service==='youtube.googleapis.com')
  return {
    httpStatus:permittedHttp(http),
    shape,
    seriesCount:list?.length??null,
    pointCount:list===null?null:safeInteger(points.length),
    newestPointUTC:times.at(-1)??null,
    oldestPointUTC:times[0]??null,
    metricShapeValid:quotedMetricOk===true,
    // Do not copy values from unvalidated foreign/malformed series.
  }
}
export function analyzeSampling({at,round,rateHttp,rateBody,exceededHttp,exceededBody}){
  const atISO=iso(at)
  if(!atISO||!Number.isInteger(round)||round<1||round>3)
    throw Error('INVALID_DIAGNOSTIC_SAMPLING')
  const day=pacificSearchDay(atISO)
  const rate=summarizeResponse(rateHttp,rateBody,RATE)
  const exceeded=summarizeResponse(exceededHttp,exceededBody,EXCEEDED)
  let preflight=null,parseStatus='unavailable'
  try{
    const v=evaluatePacificSearchBudget({
      now:atISO,rateHttp,rateResponse:rateBody,
      exceededHttp,exceededResponse:exceededBody,
    })
    preflight={
      advisory:v.smallBatchAdvisory,
      blocks:v.blocks,
      observedSearchUnits:safeInteger(v.rate.units),
      observedExceededPoints:safeInteger(v.exceeded.exceededTrue),
      ageMinutes:v.monitoringSampleAgeMinutes,
      observedGoogleRemaining:null, // intentionally NEVER inferred
      proposedAdapterResearchCap:v.researchBudgetProposed,
      googleProjectLimitConfigured:v.measuredProjectDailyLimit,
    }
    parseStatus='validated'
  }catch{parseStatus='invalid-metric-or-series'}
  return {
    kind:'moviehub-youtube-monitoring-response-readonly-sample',
    round,checkedAt:atISO,pacificDay:day.date,
    ptResetUTC:day.start,ptNextResetUTC:day.end,
    rate,exceeded,parseStatus,preflight,
    youtubeSearchCalls:0,providerWrites:0,quotaMutations:0,
    googleRemainingQuotaGuaranteed:false,
  }
}
export function compareSamples(samples){
  if(!Array.isArray(samples)||samples.length!==3||
    samples.some((x,i)=>x?.round!==i+1))
    throw Error('THREE_SAMPLES_REQUIRED')
  const diffs=samples.slice(1).map((s,i)=>{
    const before=samples[i]
    const changed=[]
    for(const type of ['rate','exceeded']){
      for(const key of ['httpStatus','shape','seriesCount','pointCount','newestPointUTC']){
        if(before[type]?.[key]!==s[type]?.[key])changed.push(type+'.'+key)
      }
    }
    for(const key of ['advisory','observedSearchUnits','ageMinutes']){
      if(before.preflight?.[key]!==s.preflight?.[key])
        changed.push('preflight.'+key)
    }
    return {from:before.round,to:s.round,changedFields:changed}
  })
  return {
    kind:'moviehub-youtube-monitoring-three-sample-comparison',
    schemaVersion:1,source:'google-cloud-monitoring-readonly',
    startsAt:samples[0].checkedAt,endsAt:samples[2].checkedAt,
    samples,differences:diffs,
    anyAdmissionAdvisory:samples.some(x=>x.preflight?.advisory===true),
    allAdmissionAdvisories:samples.every(x=>x.preflight?.advisory===true),
    // Absence of an advisory must not promote a 50-call search budget.
    wouldAuthorizeGoogleSearch:false,
    youtubeSearchCalls:0,quotaMutations:0,firestoreWrites:0,
  }
}
export function diagnosticMarkdown(report){
  const lines=['# YouTube Monitoring: isolierte Budget-Abfrage (3 Messungen)','',
    'Es werden nur Google Cloud Monitoring-Messwerte gelesen. Keine YouTube-Suchanfrage, kein Deploy, keine Quotenänderung.',
    '',
    '| Probe | Zeit (UTC) | rate HTTP | rate-Shape | rate-Punkte | letzter Punkt | exceeded HTTP | exceeded-Shape | gemessene Units | Alter (min) | Advisory |',
    '|---|---|---|---|---:|---|---|---|---:|---:|---|',
    ...report.samples.map(s=>[
      s.round,s.checkedAt,s.rate.httpStatus??'?',s.rate.shape,
      s.rate.pointCount??'?',s.rate.newestPointUTC??'-',
      s.exceeded.httpStatus??'?',s.exceeded.shape,
      s.preflight?.observedSearchUnits??'?',s.preflight?.ageMinutes??'?',
      s.preflight?.advisory===true?'ja':'nein'
    ].join(' | ').replace(/^/,'| ').concat(' |')),
    '', '## Veränderungen von Antwort 1 → 2 → 3',
    ...report.differences.map(x=>'- '+x.from+' → '+x.to+': '+
      (x.changedFields.join(', ')||'keine erfasste Feldänderung')),
    '',
    '## Aktuelle Entscheidungsgründe (keine Freigabe durch diesen Test)',
    ...report.samples.map(x=>'- Probe '+x.round+': '+
      (x.preflight?.blocks?.join(', ')||'keine')+
      (x.parseStatus==='validated'?'':' (Antwort nicht vollständig auswertbar)')),
    '', '**Wichtig:** Nur beobachtete Nutzung; keine garantierte Restquote, keine echten Suchversuche.',
  ]
  return lines.join('\n')+'\n'
}
function makeMonitoringUrl(metric,day,at){
  const params=new URLSearchParams({
    filter:`metric.type="${metric}" AND resource.type="consumer_quota" AND resource.label.service="youtube.googleapis.com" AND metric.label.quota_metric="${QUOTA}"`,
    'interval.startTime':day.start,
    'interval.endTime':at,
    view:'FULL',pageSize:'5000',
  })
  return 'https://monitoring.googleapis.com/v3/projects/movie-hub-62459/timeSeries?'+params.toString()
}
async function getMonitoring({metric,at,day,token,fetchImpl}){
  try{
    const response=await fetchImpl(makeMonitoringUrl(metric,day,at),{
      headers:{authorization:'Bearer '+token,accept:'application/json'},
      signal:AbortSignal.timeout(35000),
    })
    if(response.status!==200)return {http:response.status,body:null}
    const contentLength=Number(response.headers?.get?.('content-length')??0)
    if(contentLength>2_000_000)return {http:200,body:null}
    const raw=await response.text()
    if(raw.length>2_000_000)return {http:200,body:null}
    let body
    try{body=JSON.parse(raw)}catch{body=null}
    return {http:200,body}
  }catch{return {http:null,body:null}}
}
export async function runReadOnlyMonitoringDiagnosis({
  fetchImpl=fetch,
  getToken=async()=>execFileSync('gcloud',['auth','print-access-token'],{
    encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore'],
  }).trim(),
  now=()=>new Date().toISOString(),
  sleep=delay,
  pauses=[120000,180000],
  outDir=output,
  writeArtifacts=true,
}={}){
  if(pauses.length!==2||pauses.some(x=>!Number.isInteger(x)||x<0||x>180000))
    throw Error('DIAG_PAUSE_INVALID')
  const token=await getToken()
  if(typeof token!=='string'||token.length<16)
    throw Error('DIAG_CLOUD_MONITORING_AUTH_UNAVAILABLE')
  const samples=[]
  for(let i=0;i<3;i++){
    if(i>0)await sleep(pauses[i-1])
    const at=now(),day=pacificSearchDay(at)
    const [rate,exceeded]=await Promise.all(TYPES.map(([,metric])=>
      getMonitoring({metric,at,day,token,fetchImpl})))
    samples.push(analyzeSampling({
      at,round:i+1,rateHttp:rate.http,rateBody:rate.body,
      exceededHttp:exceeded.http,exceededBody:exceeded.body,
    }))
  }
  const report=compareSamples(samples)
  if(writeArtifacts){
    await mkdir(outDir,{recursive:true})
    await writeFile(outDir+'/summary.json',JSON.stringify(report,null,2)+'\n',{mode:0o600})
    await writeFile(outDir+'/report.md',diagnosticMarkdown(report),{mode:0o600})
  }
  // Log ONLY sanitized summary. No auth tokens/raw responses, ever.
  console.log(JSON.stringify({
    kind:report.kind,
    checked:report.samples.map(s=>({at:s.checkedAt,rateShape:s.rate.shape,
      exceededShape:s.exceeded.shape,ratePoints:s.rate.pointCount,
      newestPoint:s.rate.newestPointUTC,advisory:s.preflight?.advisory??false,
      blocks:s.preflight?.blocks??['invalid-response']})),
    anyAdmissionAdvisory:report.anyAdmissionAdvisory,youtubeSearchCalls:0,
  }))
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runReadOnlyMonitoringDiagnosis().catch(()=>{
    console.error('MONITORING_DIAGNOSTIC_UNAVAILABLE (credentials or environment; no API error bodies).')
    process.exitCode=1
  })
}
