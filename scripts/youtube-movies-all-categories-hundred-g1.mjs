// Read-only G1 all-DE-categories discovery. 100 are VIDEO hypotheses, never validated works.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle} from './youtube-api-smoke.mjs'
import {minutes,storeChannelLabel,deAssessment,normalizedTitle,QUERY_STRATA} from './youtube-movies-fifty-g1.mjs'
export const TARGET=100,MAX_SEARCH=76,MAX_VIDEO=30,MAX_IDS=1500
export const OLD='docs/_work/YOUTUBE_MOVIES_G1_47_EVIDENCE_INPUT_2026-10-21.json'
export const REPORT='artifacts/youtube-movies-g1/all-categories-hundred.md'
export const OLD_CATEGORIES=['30','35','36','39','43']
const clean=s=>safeTitle(s).trim()
const negative=/(?:\btrailer\b|\bteaser\b|\bclip\b|\bgameplay\b|\breview\b|\binterview\b|\bkonzert\b|\barenatour\b|\bsaga teil \d+\b)/i
const positive=/(?:ganzer film|ganze filme|full movie|full film|kompletter film|film in voller l[aä]nge|feature film|pel[ií]cula completa)/i
export function historical(m){
 if(m?.expectedUniqueVideoIds!==47||m?.expectedObservationCount!==49||
  m.observations?.length!==49)throw Error('G1 original 47/49 manifest mismatch')
 const rows=new Map()
 for(const x of m.observations){
  if(!isVideoId(x.videoId)||!clean(x.title))throw Error('Invalid original video')
  if(!rows.has(x.videoId))rows.set(x.videoId,x.title)
 }
 if(rows.size!==47)throw Error('Expected 47 distinct prior video IDs')
 return [...rows.keys()]
}
export function categories(de,legacy){
 if(!Array.isArray(de?.items)||!Array.isArray(legacy?.items))
  throw Error('Both official category lists required')
 const rows=new Map()
 for(const [items,field] of [[de.items,'deListed'],[legacy.items,'legacyListed']]){
  for(const v of items){
   const id=String(v?.id||'')
   if(!/^\d{1,3}$/.test(id))continue
   const r=rows.get(id)||{id,title:'?',deListed:false,legacyListed:false,assignable:null}
   r[field]=true
   if(clean(v.snippet?.title))r.title=clean(v.snippet.title)
   if(typeof v.snippet?.assignable==='boolean')r.assignable=v.snippet.assignable
   rows.set(id,r)
  }
 }
 const list=[...rows.values()].sort((a,b)=>Number(a.id)-Number(b.id))
 if(!list.length||list.length>MAX_SEARCH)throw Error('Too many or no categories to test')
 return {list,missingHistorical:OLD_CATEGORIES.filter(id=>!rows.has(id))}
}
export function plan(categories){
 if(categories.length>MAX_SEARCH)throw Error('Cannot test every category')
 const base=categories.map(c=>({id:c.id,mode:'category',params:{
  part:'snippet',type:'video',videoCategoryId:c.id,videoDuration:'long',
  q:'ganzer film',regionCode:'DE',relevanceLanguage:'de',maxResults:50}}))
 const movie=categories.map(c=>({id:c.id,mode:'category-movie',params:{
  part:'snippet',type:'video',videoCategoryId:c.id,videoType:'movie',
  videoDuration:'long',q:'film',regionCode:'DE',relevanceLanguage:'de',maxResults:50}}))
 const fallback=QUERY_STRATA.map(x=>({id:null,mode:'movie-control',params:{
  part:'snippet',type:'video',videoType:'movie',videoDuration:'long',q:x.q,
  regionCode:'DE',relevanceLanguage:x.name.startsWith('EN')?'en':'de',maxResults:50}}))
 return [...base,...movie,...fallback].slice(0,MAX_SEARCH)
}
export function select100(prior,results,videos){
 const hist=new Set(prior),provenance=new Map()
 for(const r of results)for(const hit of r.hits){
  const modes=provenance.get(hit)||new Set()
  modes.add(r.mode);provenance.set(hit,modes)
 }
 const accepted=[],rejected={}
 for(const v of videos){
  const title=clean(v?.snippet?.title)
  const duration=minutes(v?.contentDetails?.duration)
  const region=deAssessment(v?.contentDetails?.regionRestriction)
  const reason= !isVideoId(v?.id)||!title?'invalid':
   v.status?.privacyStatus!=='public'?'nonpublic':
   duration===null||duration<60?'short':
   region==='excluded'?'DE-excluded':
   negative.test(title)?'nonfilm-title':null
  if(reason){rejected[reason]=(rejected[reason]||0)+1;continue}
  const modes=provenance.get(v.id)||new Set()
  const old=hist.has(v.id)
  const signal=old?'historical':storeChannelLabel(v.snippet?.channelTitle)?
   'youtube-movies-label':modes.has('category-movie')||modes.has('movie-control')?
   'movie-search':positive.test(title)?'full-film-title':'weak-category-only'
  if(signal==='weak-category-only'){
   rejected.weak=(rejected.weak||0)+1;continue
  }
  accepted.push({videoId:v.id,title,source:old?'existing-47':'new-search',
   categoryId:String(v.snippet?.categoryId||'?'),signal,region,
   duration:Math.round(duration*10)/10,modeCount:modes.size,
   channel:clean(v.snippet?.channelTitle),normalizedTitle:normalizedTitle(title)})
 }
 // Deduplicate video IDs, never silently call distinct VIDEO IDs distinct film works.
 const unique=[...new Map(accepted.map(x=>[x.videoId,x])).values()]
 const score=x=>(x.source==='existing-47'?8:0)+
  (x.signal==='youtube-movies-label'?5:0)+
  (x.signal==='movie-search'?3:0)+x.modeCount/10
 unique.sort((a,b)=>score(b)-score(a)||a.videoId.localeCompare(b.videoId))
 const selected=[],used=new Set()
 const take=x=>{if(selected.length>=TARGET||used.has(x.videoId))return
  used.add(x.videoId);selected.push(x)}
 // Guarantee category diversity ahead of the familiar 47.
 const seen=new Set()
 for(const x of unique.filter(x=>x.source==='new-search')){
  if(!seen.has(x.categoryId)){seen.add(x.categoryId);take(x)}
 }
 for(const x of unique)take(x)
 return{selected,eligibleVideoIds:unique.length,rejected,
  oldSelected:selected.filter(x=>x.source==='existing-47').length,
  newSelected:selected.filter(x=>x.source==='new-search').length,
  distinctTitleStrings:new Set(selected.map(x=>x.normalizedTitle).filter(Boolean)).size,
  missing:Math.max(0,TARGET-selected.length)}
}
export async function run({oldManifest,api,now=()=>new Date().toISOString()}){
 if(typeof api!=='function')throw Error('read-only API callback required')
 const prior=historical(oldManifest)
 const de=await api('videoCategories',{part:'snippet',regionCode:'DE',hl:'de_DE'})
 let legacy={items:[]},legacyError=null
 try{legacy=await api('videoCategories',{part:'snippet',id:OLD_CATEGORIES.join(','),hl:'de_DE'})}
 catch(e){legacyError=String(e?.message||'failed').slice(0,90)}
 const directory=categories(de,legacy),allPlan=plan(directory.list)
 const results=[],errors=[],rawIds=new Set()
 let calls=0,quotaStopped=false
 for(const query of allPlan){
  if(quotaStopped)break
  calls++
  try{
   const response=await api('search',query.params)
   const ids=[...new Set((response?.items||[]).map(x=>x?.id?.videoId).filter(isVideoId))]
   for(const id of ids)rawIds.add(id)
   results.push({...query,hits:ids,status:'ok'})
  }catch(e){
   const msg=String(e?.message||'failure')
   const state=/HTTP (?:403|429)|quota|rate limit/i.test(msg)?'quota-or-rate-limit':
    /HTTP 400/.test(msg)?'invalid-category-or-filter':'search-error'
   results.push({...query,hits:[],status:state})
   errors.push(query.id+'/'+query.mode+':'+state)
   if(state==='quota-or-rate-limit')quotaStopped=true
  }
 }
 // Rescreen all original 47; they only count when fresh video metadata passes.
 const allIds=[...prior,...[...rawIds].filter(x=>!prior.includes(x))].slice(0,MAX_IDS)
 const videos=[]
 let videoCalls=0
 for(let i=0;i<allIds.length&&videoCalls<MAX_VIDEO;i+=50){
  videoCalls++
  try{
   const response=await api('videos',{
    part:'snippet,contentDetails,status',id:allIds.slice(i,i+50).join(',')})
   for(const v of response?.items||[])if(isVideoId(v?.id))videos.push(v)
  }catch(e){errors.push('videos-batch:error');if(/HTTP (?:403|429)|quota/i.test(String(e?.message||'')))break}
 }
 const sample=select100(prior,results,videos)
 const totals=directory.list.map(c=>{
  const r1=results.find(x=>x.id===c.id&&x.mode==='category')
  const r2=results.find(x=>x.id===c.id&&x.mode==='category-movie')
  return{...c,category:r1?.status||'not-probed',categoryHits:r1?.hits.length||0,
   movie:r2?.status||'not-probed',movieHits:r2?.hits.length||0}
 })
 const fmt=x=>x==='unknown'?'unknown':x
 const lines=['# G1 – all DE YouTube video categories, target 100 movie video candidates','',
  '- Generated: '+now(),'- Goal: 100 DIFFERENT plausible film VIDEO IDs, NOT 100 confirmed film works.',
  '- Actual selected **'+sample.selected.length+'/100**; missing **'+sample.missing+'**.',
  '- Freshly revalidated prior-47: '+sample.oldSelected+
   '; newly observed IDs in selected set: '+sample.newSelected+'.',
  '- Unique normalized title strings among selected: '+sample.distinctTitleStrings+
   ' (name collisions/remakes/editions still unresolved).',
  '- Legacy category-ID lookup: '+(legacyError?'failed ('+legacyError+')':'completed')+'.',
  '- Category IDs from official DE list plus separately requested 30/35/36/39/43: '+directory.list.length+
   '; historical IDs absent from official directories: '+(directory.missingHistorical.join(', ')||'none')+'.',
  '- Category base probes completed: '+results.filter(x=>x.mode==='category').length+
   '/'+directory.list.length+'; quota stopped: '+quotaStopped+'.',
  '- API read calls: 2 videoCategories.list, '+calls+'/'+MAX_SEARCH+
   ' search.list, '+videoCalls+'/'+MAX_VIDEO+' videos.list (search quota project/day may be lower).',
  '- Raw unique search VIDEO IDs: '+rawIds.size+'; bounded metadata IDs: '+allIds.length+
   '; metadata rows returned: '+videos.length+'.',
  '- Search category/genre is NOT independent movie-identity proof; YouTube region metadata does NOT confirm DE playback, licensing or rent/buy/free type.',
  '- No TMDB/API provider filters, no auto-match, no Firestore / Firebase / catalog / app / badges / nightlies / product changes. G2 not authorized.','',
  '## Tested category directory and filtering','',
  '| ID | DE | YouTube category | Assignable | Basic long-video category search | category + videoType=movie |',
  '| ---: | --- | --- | --- | --- | --- |',
  ...totals.map(x=>'| '+x.id+' | '+(x.deListed?'yes':'not-listed')+' | '+clean(x.title)+' | '+
   String(x.assignable??'?')+' | '+x.category+' ('+x.categoryHits+') | '+x.movie+' ('+x.movieHits+') |'),
  '',
  '## The up-to-100 video-ID research sample','',
  '| # | Video-ID and title | Category | Prior or fresh | Movie plausibility | Runtime | DE signal | Identity and offers |',
  '| ---: | --- | --- | --- | --- | ---: | --- | --- |',
  ...sample.selected.map((x,i)=>'| '+(i+1)+' | ['+clean(x.title)+
   '](https://www.youtube.com/watch?v='+x.videoId+') '+x.videoId+' | '+
   x.categoryId+' | '+x.source+' | '+x.signal+' | '+x.duration+'m | '+
   fmt(x.region)+' | unverified / unknown |'),'',
  '## Error and next gate','',
  '- Search errors: '+(errors.join('; ')||'none')+'.',
  '- Rejections from returned video metadata: '+
    (JSON.stringify(sample.rejected)||'{}')+'.',
  '- If sample size is below 100, leave gap explicit; do NOT substitute trailers, series episodes or fabricated movie matches.',
  '- 100 YouTube VIDEO IDs are never automatically 100 separate TMDB movies; verify work, edition and content type in subsequent G1.',
  '- YouTube API policies restrict multi-owner data aggregation; this report is internal research ONLY. G2 needs a separate compliance and user gate.',
  ''
 ]
 return{directory,results,sample,stats:{searchCalls:calls,videoCalls,quotaStopped,rawUnique:rawIds.size},
  report:lines.join('\n')}
}
async function main(){
 const manifest=JSON.parse(await readFile(OLD,'utf8'))
 const key=getSecret()
 const outcome=await run({oldManifest:manifest,api:(endpoint,params)=>youtubeGet(endpoint,params,key)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(REPORT,outcome.report+'\n',{mode:0o600})
 console.log('G1 all-category read-only run: '+outcome.sample.selected.length+
  '/100 movie video candidates; '+outcome.stats.searchCalls+' searches.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 all-categories: '+
  String(e?.message||'unknown').slice(0,120));process.exitCode=1})
