/**
 * Explicitly manual YouTube quota diagnosis; no TMDB, GCS, Firebase or
 * production catalog writes. A maximum of 13 search.list and 13 videos.list
 * requests over four hours with the SAME key as production.
 *
 * No user input can select arbitrary URLs, endpoints or credentials.
 * Only allowlisted result codes, counts, and times are exported.
 */
import {execFileSync} from 'node:child_process'
import {mkdir,writeFile,appendFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {pacificSearchDay} from './youtube-g2-pacific-search-preflight.mjs'

export const DIAG_INTERVAL_MINUTES=20
export const DIAG_DURATIONS=Object.freeze([60,240])
export const DIAG_SEARCH_PARAMS=Object.freeze([
  Object.freeze({part:'snippet',type:'video',regionCode:'DE',
    maxResults:10,order:'relevance',q:'Der Pate 1972',videoType:'movie'}),
  Object.freeze({part:'snippet',type:'video',regionCode:'DE',
    maxResults:10,order:'relevance',q:'Der Pate 1972',videoDuration:'long'}),
])
export const DIAG_VIDEO_PARAMS=Object.freeze({
  part:'snippet',id:'JKLdiFdf3T0',
})
const OUT='artifacts/youtube-g2/search-api-diagnostic'
const pause=ms=>new Promise(done=>setTimeout(done,ms))
const safeNumber=n=>Number.isSafeInteger(n)&&n>=0?n:null
const safeDate=t=>new Date(t).toISOString()

export function sanitizeProbe(result){
  if(result?.ok===true)
    return {status:200,reason:'OK',items:safeNumber(result.items)}
  const status=safeNumber(result?.status)
  const reason=[
    'RATE_LIMITED','RATE_LIMIT_OR_QUOTA_UNCLASSIFIED','QUOTA_OR_RATE_LIMIT',
    'QUOTA_EXHAUSTED','API_REQUEST_REJECTED','API_KEY_INVALID',
    'API_NOT_ENABLED','NETWORK_ERROR','UNKNOWN_ERROR',
  ].includes(result?.reason)?result.reason:'UNKNOWN_ERROR'
  return {status,reason,items:null,
    ...(safeNumber(result?.retryAfterMs)!==null
      ?{retryAfterMs:Math.min(result.retryAfterMs,3600000)}:{})}
}

export async function apiProbe(endpoint,params,key,{get=youtubeGet}={}){
  try{
    const response=await get(endpoint,params,key)
    return sanitizeProbe({ok:true,items:response.items.length})
  }catch(e){
    return sanitizeProbe({
      status:e?.youtubeHttpStatus??null,
      reason:e?.youtubeFailureClass??(/Netzwerk|Zeitüberschreitung/.test(String(e?.message))
        ?'NETWORK_ERROR':'UNKNOWN_ERROR'),
      retryAfterMs:e?.retryAfterMs,
    })
  }
}
const token=()=>execFileSync('gcloud',['auth','print-access-token'],{
  encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore'],
}).trim()
export async function readQuotaLimits({
  fetchImpl=fetch,getToken=token,
}={}){
  let accessToken
  try{accessToken=await getToken()}catch{return {status:'access-token-unavailable'}}
  if(typeof accessToken!=='string'||accessToken.length<16)
    return {status:'access-token-unavailable'}
  const url='https://serviceusage.googleapis.com/v1beta1/projects/movie-hub-62459/services/youtube.googleapis.com/consumerQuotaMetrics?view=FULL&pageSize=200'
  try{
    const resp=await fetchImpl(url,{
      headers:{authorization:'Bearer '+accessToken,accept:'application/json'},
      signal:AbortSignal.timeout(20000),
    })
    if(!resp.ok)return {status:'api-not-readable',httpStatus:resp.status}
    const data=await resp.json()
    if(!Array.isArray(data?.metrics))return {status:'unexpected-response'}
    const filtered=data.metrics.filter(m=>/search/i.test(
      [m?.name,m?.metric,m?.displayName].join(' ')))
    const limits=[]
    for(const metric of filtered){
      for(const row of metric.consumerQuotaLimits||[]){
        for(const bucket of row.quotaBuckets||[]){
          const n=Number(bucket.effectiveLimit)
          if(Number.isSafeInteger(n)&&n>=0&&n<=1e9)limits.push(n)
        }
      }
    }
    return {status:data.nextPageToken?'partial-pagination':'readable',
      matchingSearchMetrics:filtered.length,
      effectiveSearchLimits:[...new Set(limits)].sort((a,b)=>a-b).slice(0,20)}
  }catch{return {status:'api-unavailable'}}
}
export function interpretDiagnostic(samples,quota){
  const searches=samples.map(s=>s.search).filter(Boolean)
  const controls=samples.map(s=>s.videos)
  const count=(rows,p)=>rows.filter(p).length
  const successfulSearch=count(searches,s=>s.status===200)
  const successfulControl=count(controls,s=>s.status===200)
  const rateLimits=count(searches,s=>s.status===429)
  const explicitQuota=count(searches,s=>s.reason==='QUOTA_EXHAUSTED')
  return {
    kind:'moviehub-youtube-search-api-isolated-diagnostic',schemaVersion:1,
    quota,startedAt:samples[0]?.checkedAt??null,
    endedAt:samples.at(-1)?.checkedAt??null,
    samples,searchAttempts:searches.length,successfulSearch,
    rateLimitResponses:rateLimits,explicitQuotaResponses:explicitQuota,
    videoListAttempts:controls.length,successfulVideoList:successfulControl,
    observation:explicitQuota?'google-confirmed-search-quota-exhausted':
      successfulSearch>0?'search-worked-at-least-once':
      successfulControl>0?'search-only-failing-while-videos-works':
      'both-api-methods-or-transport-unavailable',
    noProductionWrites:true,actualGoogleRemainingQuota:null,
  }
}
export function diagnosticMarkdown(result){
  return [
    '# YouTube Data API – isolierter 429-Langzeittest','',
    'Proben über dasselbe produktive API-Key-Projekt; keine Filme oder Deeplinks veröffentlicht.',
    '',
    '## Bilanz',
    '- Suchversuche: '+result.searchAttempts,
    '- Erfolgreiche Suchen: '+result.successfulSearch,
    '- HTTP 429: '+result.rateLimitResponses,
    '- Google-bestätigte Suchquotenfehler: '+result.explicitQuotaResponses,
    '- videos.list: '+result.successfulVideoList+' / '+result.videoListAttempts,
    '- Beobachtung: '+result.observation,
    '- Google-Quotenkonfiguration lesbar: '+result.quota.status,
    '- Effektive Suche-Limits (nur bei lesbarer Quota-API): '+
      (result.quota.effectiveSearchLimits?.join(', ')||'unbekannt'),
    '- Freie Restquote: **nicht bestimmt**','',
    '| Probe | UTC | PT-Tag | Query-Variante | search HTTP | Google-Klasse | videos.list HTTP | videos.list Klasse | Retry-After (s) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...result.samples.map(s=>'| '+[
      s.round,s.checkedAt,s.pacificDay,s.searchVariant,
      s.search?.status??'-',s.search?.reason??'-',
      s.videos?.status??'-',s.videos?.reason??'-',
      s.search?.retryAfterMs!==undefined?s.search.retryAfterMs/1000:'-',
    ].join(' | ')+' |'),
    '',
    'Anfragen/Ergebnisse enthalten keine API-Schlüssel, Videos, Rohantworten oder Suchtexte.',
    'Die Messpunkte beweisen keine ununterbrochene Sperrzeit.',
  ].join('\n')+'\n'
}
export async function runDiagnostic({
  durationMinutes=240,
  apiCall,
  quotaRead=readQuotaLimits,
  nowMs=Date.now,
  wait=pause,
  onProgress=async()=>{},
}={}){
  if(!DIAG_DURATIONS.includes(durationMinutes)||typeof apiCall!=='function')
    throw Error('YOUTUBE_DIAG_INPUT_INVALID')
  const start=nowMs(),quota=await quotaRead(),samples=[]
  const rounds=durationMinutes/DIAG_INTERVAL_MINUTES+1
  for(let i=0;i<rounds;i++){
    const delay=Math.max(0,start+i*DIAG_INTERVAL_MINUTES*60000-nowMs())
    if(delay)await wait(delay)
    const checkedAt=safeDate(nowMs())
    const videos=sanitizeProbe(await apiCall('videos',DIAG_VIDEO_PARAMS))
    const search=sanitizeProbe(await apiCall('search',
      DIAG_SEARCH_PARAMS[i%DIAG_SEARCH_PARAMS.length]))
    samples.push({round:i+1,checkedAt,pacificDay:pacificSearchDay(checkedAt).date,
      searchVariant:i%2===0?'film-type':'long-duration',videos,search})
    const state=interpretDiagnostic(samples,quota)
    await onProgress(state)
    if(search.reason==='QUOTA_EXHAUSTED'
      ||search.reason==='API_KEY_INVALID'||search.reason==='API_NOT_ENABLED')
      break
  }
  return interpretDiagnostic(samples,quota)
}
export async function main(){
  const durationMinutes=Number(process.env.YT_DIAG_DURATION_MINUTES||'240')
  if(!DIAG_DURATIONS.includes(durationMinutes)
    ||process.env.DATA_CHECKPOINT_ENABLED==='1')
    throw Error('YOUTUBE_DIAG_UNSAFE_ENVIRONMENT')
  const key=getSecret()
  const onProgress=async result=>{
    await mkdir(OUT,{recursive:true})
    await writeFile(OUT+'/summary.json',JSON.stringify(result,null,2)+'\n',{mode:0o600})
    await writeFile(OUT+'/report.md',diagnosticMarkdown(result),{mode:0o600})
    const last=result.samples.at(-1)
    console.log(JSON.stringify({round:last.round,at:last.checkedAt,
      variant:last.searchVariant,search:last.search,videos:last.videos,
      searchAttempts:result.searchAttempts,successfulSearch:result.successfulSearch,
      quotaReadStatus:result.quota.status,productionWrites:0}))
  }
  const result=await runDiagnostic({durationMinutes,
    apiCall:(endpoint,params)=>apiProbe(endpoint,params,key),
    onProgress})
  if(process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY,diagnosticMarkdown(result))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(()=>{
    console.error('YOUTUBE_DIAG_FAILED (no credentials or runner stopped; check sanitized partial artifact).')
    process.exitCode=1
  })
