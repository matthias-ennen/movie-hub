/**
 * Conservative Google Cloud Monitoring search quota preflight by Pacific day.
 * It cannot authorize requests: Monitoring reports with sampling delay;
 * external project callers and their future API usage remain unknown.
 * No YouTube API calls, no GCS/IAM/Firestore/quotas modifications.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export const KIND='moviehub-youtube-g2-pacific-search-budget-preflight'
export const QUOTA='youtube.googleapis.com/search_list'
export const RATE='serviceruntime.googleapis.com/quota/rate/net_usage'
export const EXCEEDED='serviceruntime.googleapis.com/quota/exceeded'
const format=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Los_Angeles',hourCycle:'h23',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
})
function local(utc){
  const p=Object.fromEntries(format.formatToParts(new Date(utc))
    .filter(x=>['year','month','day','hour','minute'].includes(x.type))
    .map(x=>[x.type,Number(x.value)]))
  if(!Number.isInteger(p.year)||p.year<2020)throw Error('INVALID_PACIFIC_DATE')
  return p
}
function midnight({year,month,day}){
  for(const h of [7,8]){
    const s=new Date(Date.UTC(year,month-1,day,h)).toISOString()
    const p=local(s)
    if(p.year===year&&p.month===month&&p.day===day&&p.hour===0&&p.minute===0)
      return s
  }
  throw Error('PACIFIC_MIDNIGHT_UNKNOWN')
}
export function pacificSearchDay(now){
  if(!Number.isFinite(Date.parse(now)))throw Error('INVALID_SEARCH_PREFLIGHT_TIME')
  const p=local(now),start=midnight(p)
  const next=new Date(Date.UTC(p.year,p.month-1,p.day+1))
  const end=midnight({year:next.getUTCFullYear(),
    month:next.getUTCMonth()+1,day:next.getUTCDate()})
  const n=Date.parse(now)
  if(n<Date.parse(start)||n>=Date.parse(end))throw Error('PACIFIC_TIME_WINDOW_MISMATCH')
  return {
    date:[p.year,String(p.month).padStart(2,'0'),String(p.day).padStart(2,'0')].join('-'),
    start,end,
  }
}
function readSeries(http,response,metric,day,now){
  if(!Number.isInteger(http)||http<0||http>599)throw Error('INVALID_MONITORING_STATUS')
  const result={http,complete:false,series:0,points:0,units:0,
    exceededTrue:0,newest:null}
  if(http!==200)return result
  if(!response||typeof response!=='object'||Array.isArray(response)
    ||!Array.isArray(response.timeSeries)||response.nextPageToken)
    return result
  if(response.timeSeries.length>100)throw Error('MONITORING_TOO_MANY_SERIES')
  result.complete=true
  for(const s of response.timeSeries){
    if(s?.metric?.type!==metric||s?.metric?.labels?.quota_metric!==QUOTA
      ||s?.resource?.type!=='consumer_quota'
      ||s?.resource?.labels?.service!=='youtube.googleapis.com'
      ||!Array.isArray(s.points)||s.points.length>5000)
      throw Error('MONITORING_FOREIGN_QUOTA_SERIES')
    result.series++
    for(const point of s.points){
      const a=Date.parse(point?.interval?.startTime??point?.interval?.endTime)
      const b=Date.parse(point?.interval?.endTime)
      if(!Number.isFinite(a)||!Number.isFinite(b)||a>b
        ||a<Date.parse(day.start)||b>Date.parse(now)||b>=Date.parse(day.end))
        throw Error('MONITORING_POINT_OUTSIDE_PACIFIC_DAY')
      if(metric===RATE){
        const v=point?.value?.int64Value
        if(typeof v!=='string'||!/^\d{1,14}$/.test(v))
          throw Error('MONITORING_INVALID_RATE')
        result.units+=Number(v)
        if(!Number.isSafeInteger(result.units))throw Error('MONITORING_RATE_OVERFLOW')
      }else{
        if(typeof point?.value?.boolValue!=='boolean')
          throw Error('MONITORING_INVALID_EXCEEDED')
        if(point.value.boolValue)result.exceededTrue++
      }
      result.points++
      const t=new Date(b).toISOString()
      if(!result.newest||t>result.newest)result.newest=t
    }
  }
  return result
}
export function evaluatePacificSearchBudget({
  now,rateHttp,rateResponse,exceededHttp,exceededResponse,
}={}){
  const day=pacificSearchDay(now)
  const rate=readSeries(rateHttp,rateResponse,RATE,day,now)
  const exceeded=readSeries(exceededHttp,exceededResponse,EXCEEDED,day,now)
  const age=rate.newest===null?null:Math.floor(
    (Date.parse(now)-Date.parse(rate.newest))/60000)
  const blocks=[]
  if(Date.parse(now)-Date.parse(day.start)<3600000)blocks.push('early-after-PT-reset')
  if(!rate.complete||!exceeded.complete)blocks.push('metrics-inaccessible-or-paginated')
  if(!rate.points)blocks.push('no-observed-usage-is-not-zero')
  if(age===null||age>15)blocks.push('monitoring-samples-not-recent')
  if(exceeded.exceededTrue)blocks.push('quota-exceeded-reported-today')
  const ceiling=100-30-10-10
  if(rate.units>ceiling)blocks.push('outside-conservative-10-call-headroom')
  // This flag is advisory only. Even if true, another project caller may
  // exhaust the bucket during Monitoring's reporting lag.
  const smallBatchAdvisory=blocks.length===0
  return {
    kind:KIND,checkedAt:new Date(now).toISOString(),
    pacificDate:day.date,resetStartUTC:day.start,nextResetUTC:day.end,
    measuredProjectDailyLimit:100,researchBudgetProposed:10,
    otherConsumersReserve:30,monitoringLagBuffer:10,
    rate,exceeded,monitoringSampleAgeMinutes:age,blocks,
    smallBatchAdvisory,
    currentQuotaRemaining:null,
    monitoringIsActualRemainingQuota:false,
    acquiredSharedReservation:false,
    authorizedSearchCalls:0,automaticSearchAllowed:false,
    youtubeSearchCalls:0,quotaWrites:0,firestoreWrites:0,
    providerWrites:0,privateArtifact:true,publicationPermitted:false,
  }
}
export async function runPacificSearchPreflight({
  now,rateHttp,rateFile,exceededHttp,exceededFile,output,
}={}){
  if(!output||!rateFile||!exceededFile||process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('SEARCH_PREFLIGHT_READONLY_INPUT_REQUIRED')
  const load=async(status,path)=>Number(status)===200
    ?JSON.parse(await readFile(path,'utf8')):null
  const r=evaluatePacificSearchBudget({
    now,rateHttp:Number(rateHttp),rateResponse:await load(rateHttp,rateFile),
    exceededHttp:Number(exceededHttp),
    exceededResponse:await load(exceededHttp,exceededFile),
  })
  await mkdir(output,{recursive:true})
  await writeFile(output+'/summary.json',JSON.stringify(r,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({
    kind:r.kind,pacificDate:r.pacificDate,
    resetStartUTC:r.resetStartUTC,nextResetUTC:r.nextResetUTC,
    observedUsage:r.rate.units,observedExceeded:r.exceeded.exceededTrue,
    rateStatus:r.rate.http,exceededStatus:r.exceeded.http,
    advisory:r.smallBatchAdvisory,blocks:r.blocks,
    actualRemaining:null,authorizedSearchCalls:0,youtubeCalls:0,
  }))
  return r
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runPacificSearchPreflight({
    now:process.argv[2],rateHttp:process.argv[3],rateFile:process.argv[4],
    exceededHttp:process.argv[5],exceededFile:process.argv[6],
    output:process.argv[7],
  }).catch(e=>{console.error('PACIFIC_SEARCH_PREFLIGHT_FAILED_CLOSED: '+e.message);process.exitCode=1})
}
