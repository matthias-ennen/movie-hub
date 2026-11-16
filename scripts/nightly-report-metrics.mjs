/** Counts-only evidence for the central nightly report. No provider requests or product writes. */
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

export const DIR='artifacts/nightly-metrics'
export const count=v=>Number.isSafeInteger(v)&&v>=0?v:null
const num=(v,keys)=>keys.split(' ').reduce((o,k)=>({...o,[k]:count(v?.[k])}),{})
const status=v=>['success','failure','skipped','cancelled'].includes(v)?v:'unknown'
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null
const days=(from,to)=>iso(from)&&iso(to)&&Date.parse(to)>Date.parse(from)?Math.round((Date.parse(to)-Date.parse(from))/86400000*10)/10:null
const ratio=(a,b)=>count(a)!==null&&count(b)>0&&a<=b?Math.round(a/b*1000)/10:null
const sum=values=>values.every(v=>count(v)!==null)?values.reduce((a,b)=>a+b,0):null
export async function readJson(p,input=readFile){try{return JSON.parse(await input(p,'utf8'))}catch{return null}}
export async function writeJson(p,value){await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(value)+'\n',{mode:0o600})}
export function safeObservation(kind,value){
  if(kind==='waipu-cache'||kind==='joyn-cache'){
    if(value?.kind!=='g2v-original-adapter-persistent-reuse'||value.sourceId!==kind.slice(0,-6))return null
    return num(value,'actualSearchStarts restoredResponses sharedResponseHits capturedResponses priorRunHits sameRunHits evictedResponses avoidedInitialSearches')
  }
  if(kind==='xmltv-match'){
    if(value?.kind!=='xmltv-g2w-private-shared-cache-preview')return null
    return {...num(value,'validatedSources selectedCandidates baselineMatched combinedMatched additionalMatched cacheResponseHits cacheResponseMisses newTmdbApiRequests'),
      ...num(value.runtimeReadiness,'androidReadyRows catalogReadyRows runtimeReadyRows deduplicatedRuntimeAirings missingCatalogRows'),
      ...num(value.runtimeReadiness?.metadataDemand,'approvedUniqueTitles missingApprovedUniqueTitles fetchNeededFromCurrentSources')}
  }
  if(kind==='xmltv-canonical'&&value?.kind==='xmltv-post-canonical-air-plan')return num(value,'received eligible completeUniqueTitles pendingUniqueTitles projected unresolved deduplicated stationsWithAirings')
  if(kind==='xmltv-publication')return num(value,'stations freshStations retainedStations airings expiredAirings missingCanonicalAirings')
  return null
}
// A reporting failure must never change a successful adapter or publication.
export async function observeNightly(kind,value){
  try{const safe=safeObservation(kind,value);if(safe)await writeJson(DIR+'/'+kind+'.json',safe)}
  catch{console.warn('Nightly count observation unavailable: '+kind)}
}
const stockData=d=>d?.kind==='movie-hub-data-status'?{
  catalog:count(d.catalog?.total),movies:count(d.catalog?.movies),series:count(d.catalog?.series),
  search:count(d.searchIndex?.total),searchMovies:count(d.searchIndex?.movies),searchSeries:count(d.searchIndex?.series),
  completeDetails:count(d.completeSearchDetails?.total),pendingDetails:count(d.completeSearchDetails?.pending),
  seasonAvailable:count(d.seriesSeasons?.available),seasonRequested:count(d.seriesSeasons?.requested),
}:null
const waipuIndex=v=>v?.kind==='waipu-live-index'?v:null
const joynIndex=v=>v?.kind==='joyn-live-index'?v:null
const fields={
  catalog:'TMDB-Katalog',movies:'TMDB Filme',series:'TMDB Serien',search:'Suchindex',
  waipuStations:'Waipu Sender',waipuAirings:'Waipu Ausstrahlungen',waipuRead:'Waipu Eingangsprogramme',
  joynStations:'Joyn Sender',joynAirings:'Joyn Ausstrahlungen',joynRead:'Joyn Eingangsprogramme',
  xmltvStations:'XMLTV Sender',xmltvAirings:'XMLTV Ausstrahlungen',xmltvStagedRows:'XMLTV Eingangsprogramme',xmltvSources:'XMLTV verfügbare Feeds',
  tvUniqueTitles:'TV eindeutige Titel',tvTitleDayEntries:'TV Titel-Tages-Einträge',tvAirings:'TV Ausstrahlungen',
  youtubeVideos:'YouTube Playlist-Videos',youtubeLinks:'YouTube redaktionelle Direktlinks',
}
const group={catalog:'tmdb',movies:'tmdb',series:'tmdb',search:'tmdb',waipuStations:'waipu',waipuAirings:'waipu',waipuRead:'waipu',joynStations:'joyn',joynAirings:'joyn',joynRead:'joyn',xmltvStations:'xmltv',xmltvAirings:'xmltv',xmltvStagedRows:'xmltvInput',xmltvSources:'xmltvInput',tvUniqueTitles:'tv',tvTitleDayEntries:'tv',tvAirings:'tv',youtubeVideos:'youtube',youtubeLinks:'youtube'}
const pickStock=v=>Object.fromEntries(Object.keys(fields).map(k=>[k,count(v?.[k])]))
export function buildDataMetrics(d={},steps={}){
  const w=waipuIndex(d.waipu),j=joynIndex(d.joyn),bW=waipuIndex(d.baselineWaipu),bJ=joynIndex(d.baselineJoyn)
  const tmdb=stockData(d.data),baseline=stockData(d.baselineData)
  const jDiag=d.joynDiagnostic?.kind==='joyn-adapter-diagnostic'?d.joynDiagnostic:null
  const s=status(steps.xmltvStage)==='success'&&d.xmltvStage?.kind==='xmltv-g2-private-staging-aggregate'?d.xmltvStage:null
  const x=s&&Array.isArray(s.sources)?s.sources.filter(r=>r?.status==='staged'):null
  const wFresh=status(steps.waipu)==='success',jFresh=status(steps.joyn)==='success'
  const xmlFresh=status(steps.xmltvMatch)==='success',xmlPublish=status(steps.xmltvPublish)==='success'
  const wm=wFresh?w?.metrics:null,jm=jFresh?jDiag?.matching:null
  const xm=xmlFresh&&d.xmltvMatch?num(d.xmltvMatch,'validatedSources selectedCandidates baselineMatched combinedMatched additionalMatched cacheResponseHits cacheResponseMisses newTmdbApiRequests androidReadyRows catalogReadyRows runtimeReadyRows deduplicatedRuntimeAirings missingCatalogRows approvedUniqueTitles missingApprovedUniqueTitles fetchNeededFromCurrentSources'):null
  const xp=xmlPublish&&d.xmltvPublish?num(d.xmltvPublish,'stations freshStations retainedStations airings expiredAirings missingCanonicalAirings'):null
  const cache=(v,fresh)=>v&&fresh?num(v,'actualSearchStarts restoredResponses sharedResponseHits capturedResponses priorRunHits sameRunHits evictedResponses avoidedInitialSearches'):null
  const wc=cache(d.waipuCache,wFresh),jc=cache(d.joynCache,jFresh)
  return {
    kind:'moviehub-nightly-data-metrics',schemaVersion:1,
    steps:Object.fromEntries(['tmdb','waipuSync','waipu','joyn','cacheRestore','cacheSave','xmltvStage','xmltvMatch','xmltvCanonical','xmltvPublish','youtube','tv','canonical','publish'].map(k=>[k,status(steps[k])])),
    tmdb:tmdb?{...tmdb,changedMovies:count(d.tmdbChanges?.fetched?.movie),changedSeries:count(d.tmdbChanges?.fetched?.series),...num(d.searchRun?.index,'addedCount removedCount changedOfferCount'),...num(d.searchRun?.scans,'completed expected capped')}:null,
    waipu:w?{stations:count(w.counts?.stations),titles:count(w.counts?.titles),airings:count(w.counts?.broadcasts),observedAt:iso(w.generatedAt),horizonDays:days(w.horizon?.start,w.horizon?.endExclusive),
      fresh:wFresh,candidates:count(wm?.candidatePrograms),matched:count(wm?.matchedPrograms),matchPercent:ratio(wm?.matchedPrograms,wm?.candidatePrograms),read:count(wm?.broadcastsRead),inWindow:count(wm?.broadcastsInWindow),duplicatesRemoved:count(wm?.duplicateBroadcastsRemoved)}:null,
    joyn:j?{stations:count(j.stationCount),airings:count(j.airingCount),observedAt:iso(j.generatedAt),horizonDays:days(j.horizon?.from,j.horizon?.to),fresh:jFresh,
      candidates:count(jFresh?jDiag?.mapped?.uniquePrograms:null),matched:count(jm?.matchedPrograms),matchPercent:ratio(jm?.matchedPrograms,jFresh?jDiag?.mapped?.uniquePrograms:null),read:count(jFresh?jDiag?.upstream?.programs:null)}:null,
    xmltv:{stagedSources:count(s?.stagedSourceCount),families:count(s?.availableIndependentFamilies),stagedRows:count(s?.totalStagedProgrammes),
      availableStations:x?new Set(x.flatMap(r=>Object.entries(r.stationCounts||{}).filter(([,v])=>count(v)>0).map(([k])=>k))).size:null,
      maxHorizonDays:x?.length?Math.round(Math.max(...x.map(r=>count(r.maxLatestProgrammeMinutes)??0))/144)/10:null,
      match:xm,matchPercent:ratio(xm?.combinedMatched,xm?.selectedCandidates),canonical:status(steps.xmltvCanonical)==='success'&&d.xmltvCanonical?num(d.xmltvCanonical,'received eligible completeUniqueTitles pendingUniqueTitles projected unresolved deduplicated stationsWithAirings'):null,publication:xp},
    cache:{waipu:wc,joyn:jc,avoidedInitialSearches:sum([wc?.avoidedInitialSearches,jc?.avoidedInitialSearches]),actualSearchStarts:sum([wc?.actualSearchStarts,jc?.actualSearchStarts])},
    baseline:pickStock({...baseline,waipuStations:bW?.counts?.stations,waipuAirings:bW?.counts?.broadcasts,joynStations:bJ?.stationCount,joynAirings:bJ?.airingCount}),
  }
}
export async function collectDataMetrics({env=process.env,input=readFile}={}){
  const paths={data:'public/data-status.json',baselineData:'artifacts/workflow-baseline/data-status.json',waipu:'public/waipu-live/index.json',joyn:'public/joyn-live/index.json',
    baselineWaipu:'artifacts/workflow-baseline/waipu-index.json',baselineJoyn:'artifacts/workflow-baseline/joyn-index.json',
    joynDiagnostic:'artifacts/joyn-adapter/diagnostic.json',tmdbChanges:'artifacts/tmdb-data/change-set.json',searchRun:'artifacts/search-index-run-report.json',xmltvStage:'artifacts/xmltv-g2/report.json',
    waipuCache:DIR+'/waipu-cache.json',joynCache:DIR+'/joyn-cache.json',xmltvMatch:DIR+'/xmltv-match.json',xmltvCanonical:DIR+'/xmltv-canonical.json',xmltvPublish:DIR+'/xmltv-publication.json'}
  const d=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await readJson(p,input)])))
  const steps=Object.fromEntries(['tmdb','waipuSync','waipu','joyn','cacheRestore','cacheSave','xmltvStage','xmltvMatch','xmltvCanonical','xmltvPublish','youtube','tv','canonical','publish'].map(k=>[k,env['NIGHT_METRIC_'+k.toUpperCase()]]))
  return buildDataMetrics(d,steps)
}
export function sanitizeDataMetrics(v){
  if(v?.kind!=='moviehub-nightly-data-metrics'||v.schemaVersion!==1)return null
  const match=v.xmltv?.match,canonical=v.xmltv?.canonical,publication=v.xmltv?.publication
  const percent=(x)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100?x:null
  const horizon=(x)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=31?x:null
  const adapter=x=>x?{...num(x,'stations titles airings candidates matched read inWindow duplicatesRemoved'),observedAt:iso(x.observedAt),fresh:x.fresh===true,matchPercent:percent(x.matchPercent),horizonDays:horizon(x.horizonDays)}:null
  const cache=x=>x?num(x,'actualSearchStarts restoredResponses sharedResponseHits capturedResponses priorRunHits sameRunHits evictedResponses avoidedInitialSearches'):null
  return {kind:v.kind,schemaVersion:1,
    steps:Object.fromEntries(['tmdb','waipuSync','waipu','joyn','cacheRestore','cacheSave','xmltvStage','xmltvMatch','xmltvCanonical','xmltvPublish','youtube','tv','canonical','publish'].map(k=>[k,status(v.steps?.[k])])),
    tmdb:v.tmdb?num(v.tmdb,'catalog movies series search searchMovies searchSeries completeDetails pendingDetails seasonAvailable seasonRequested changedMovies changedSeries addedCount removedCount changedOfferCount completed expected capped'):null,
    waipu:adapter(v.waipu),joyn:adapter(v.joyn),
    xmltv:{...num(v.xmltv,'stagedSources families stagedRows availableStations'),maxHorizonDays:horizon(v.xmltv?.maxHorizonDays),matchPercent:percent(v.xmltv?.matchPercent),
      match:match?num(match,'validatedSources selectedCandidates baselineMatched combinedMatched additionalMatched cacheResponseHits cacheResponseMisses newTmdbApiRequests androidReadyRows catalogReadyRows runtimeReadyRows deduplicatedRuntimeAirings missingCatalogRows approvedUniqueTitles missingApprovedUniqueTitles fetchNeededFromCurrentSources'):null,
      canonical:canonical?num(canonical,'received eligible completeUniqueTitles pendingUniqueTitles projected unresolved deduplicated stationsWithAirings'):null,
      publication:publication?num(publication,'stations freshStations retainedStations airings expiredAirings missingCanonicalAirings'):null},
    cache:{waipu:cache(v.cache?.waipu),joyn:cache(v.cache?.joyn),...num(v.cache,'avoidedInitialSearches actualSearchStarts')},
    baseline:pickStock(v.baseline)}
}
export function berlinDay(value){
  if(!iso(value))return null
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]))
  return p.year+'-'+p.month+'-'+p.day
}
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))
export function compareNightly(report,history=[],day=berlinDay(report.generatedAt)){
  const m=report.dataMetrics,qa=report.adapters
  const current=pickStock({...m?.tmdb,waipuStations:m?.waipu?.stations,waipuAirings:m?.waipu?.airings,waipuRead:m?.waipu?.read,joynStations:m?.joyn?.stations,joynAirings:m?.joyn?.airings,joynRead:m?.joyn?.read,
    xmltvStations:m?.xmltv?.publication?.stations,xmltvAirings:m?.xmltv?.publication?.airings,xmltvStagedRows:m?.xmltv?.stagedRows,xmltvSources:m?.xmltv?.stagedSources,tvUniqueTitles:qa.tv?.titles,tvTitleDayEntries:qa.tv?.titleDayEntries,tvAirings:qa.tv?.airings,
    youtubeVideos:qa.youtube?.sourceVideos,youtubeLinks:qa.youtube?.playlistEditorialLinks})
  const fresh={tmdb:m?.steps.tmdb==='success',waipu:m?.steps.waipu==='success',joyn:m?.steps.joyn==='success',
    xmltv:m?.steps.xmltvStage==='success'&&m?.steps.xmltvMatch==='success'&&m?.steps.xmltvPublish==='success'&&m?.xmltv?.publication?.retainedStations===0,
    xmltvInput:m?.steps.xmltvStage==='success',youtube:m?.steps.youtube==='success',tv:m?.steps.tv==='success'}
  const prev=Array.isArray(history)&&validDay(day)?history.filter(x=>validDay(x?.day)&&x.day<day&&Date.parse(day)-Date.parse(x.day)<=7*86400000)
    .map(x=>({day:x.day,stock:pickStock({...x.stock,tvTitleDayEntries:x.stock?.tvTitleDayEntries??x.stock?.tvTitles})})).sort((a,b)=>a.day.localeCompare(b.day)).slice(-7):[]
  const rows=Object.entries(fields).map(([key,label])=>{
    const value=current[key],last=prev.filter(x=>x.stock[key]!==null).at(-1)
    const previous=last?.stock[key]??m?.baseline?.[key]??null
    const samples=prev.map(x=>x.stock[key]).filter(v=>v!==null)
    const mean=samples.length?Math.round(samples.reduce((a,b)=>a+b,0)/samples.length*10)/10:null
    const delta=(a,b)=>a!==null&&b!==null&&b>0?Math.round((a-b)/b*1000)/10:null
    const pct=delta(value,previous),trend=delta(value,mean)
    const worst=Math.min(pct??0,trend??0)
    const severity=value===null?'unknown':!fresh[group[key]]?'stale':value===0&&(previous>0||mean>0)?'critical':worst<=-20?'critical':worst<=-10?'review':worst<=-5?'warning':Math.max(pct??0,trend??0)>=20?'increase':previous===null&&mean===null?'no-baseline':'ok'
    return {key,label,value,previous,previousDay:last?.day??null,previousIsPublishedBaseline:!last&&previous!==null,mean,samples:samples.length,delta:pct,trend,severity}
  })
  const accepted=report.steps.firebase==='success'&&m?.steps.publish==='success'
  const stock=Object.fromEntries(Object.keys(fields).map(k=>[k,accepted&&fresh[group[k]]?current[k]:null]))
  const next=validDay(day)&&accepted?[...prev,{day,stock}].slice(-7):prev
  return {rows,history:next,accepted}
}
const PHASES=[
 ['gate','Start / Doppellauf-Schutz',null,'Enforce one trusted scheduled night per Berlin day'],
 ['discovery','YouTube Discovery',null,'Real-quota YouTube discovery'],
 ['known','YouTube Bestandsprüfung',null,'Trusted known YouTube videos.list recheck'],
 ['tmdb','TMDB Änderungen und Katalog',['Collect TMDB movie and series changes','Generate TMDB catalog for strict refresh']],
 ['waipu','Waipu EPG und Zuordnung',['Refresh curated 228-station Waipu grid','Match and publish curated 228-station Waipu catalog']],
 ['joyn','Joyn EPG und Zuordnung',['Build independent Joyn live catalog']],
 ['cache','Gemeinsamer TMDB-Cache (übergreifend)',['Restore private shared TMDB checkpoint (G2v)','Save verified private shared TMDB checkpoint (G2v)']],
 ['xmltv','XMLTV Import und Matching',['Stage reviewed XMLTV feeds privately (G2w)','Compare XMLTV local matching with shared TMDB replies (private G2w)']],
 ['canonical','YouTube Playlists / kanonische Titel und XMLTV-Veröffentlichung',['Refresh admin-configured YouTube playlists through canonical source contract','Execute canonical title priority queue','Restore and prepare verified XMLTV station generations']],
 ['tv','TV-Zusammenführung',['Build compact 14-day TV summary','Build generic live availability index','Build premerged TV runtime snapshot']],
 ['youtubeEditorial','YouTube Playlist-TMDB-Zuordnung und Veröffentlichung',['Match explicit YouTube series episodes against canonical TMDB seasons (private)','Build exact YouTube episode playlist hints in TMDB season shards','Read-only YouTube playlist candidate TMDB matching','Reconcile all YouTube IDs with complete account-scoped MovieHub catalog','Review canonical TMDB metadata for missing YouTube films','Publish new YouTube playlist films as canonical TMDB metadata','Measure bidirectional YouTube inventory and exact-link coverage (private)','Attach same-night strong YouTube video matches to existing badges']],
 ['publish','Firebase und Hosting-Prüfung',['Deploy Hosting and Firestore Rules','Verify actually published source generations and app data']],
]
export function phaseTimings(jobs=[]){
  const rows=Array.isArray(jobs)?jobs:[]
  return PHASES.map(([key,label,stepNames,jobPrefix])=>{
    const candidates=stepNames?stepNames.flatMap(name=>rows.flatMap(j=>Array.isArray(j.steps)?j.steps.filter(s=>s.name===name):[])):rows.filter(j=>typeof j.name==='string'&&j.name.startsWith(jobPrefix))
    const measured=candidates.filter(x=>x.conclusion!=='skipped'&&iso(x.started_at)&&iso(x.completed_at)&&Date.parse(x.completed_at)>=Date.parse(x.started_at))
    const start=measured.length?new Date(Math.min(...measured.map(x=>Date.parse(x.started_at)))).toISOString():null
    const end=measured.length?new Date(Math.max(...measured.map(x=>Date.parse(x.completed_at)))).toISOString():null
    const result=candidates.some(x=>x.conclusion==='failure')?'failure':candidates.some(x=>x.conclusion==='cancelled')?'cancelled':candidates.length&&candidates.every(x=>x.conclusion==='skipped')?'skipped':
      candidates.length&&candidates.every(x=>['success','skipped'].includes(x.conclusion))?'success':'unknown'
    return {key,label,start,end,seconds:start&&end?Math.round((Date.parse(end)-Date.parse(start))/1000):null,result}
  })
}
export async function fetchNightlyJobs(env=process.env,fetchImpl=fetch){
  if(!env.GITHUB_TOKEN||!/^[-\w]+\/[-\w.]+$/.test(env.GITHUB_REPOSITORY||'')||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||''))return []
  try{
    const url='https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID+'/attempts/'+env.GITHUB_RUN_ATTEMPT+'/jobs?per_page=100'
    const r=await fetchImpl(url,{headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)})
    if(!r.ok)return []
    const data=await r.json();return Array.isArray(data.jobs)?data.jobs:[]
  }catch{return []}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  collectDataMetrics().then(v=>writeJson(DIR+'/aggregate.json',v)).catch(()=>{console.error('Nightly metrics unavailable');process.exitCode=1})
}
