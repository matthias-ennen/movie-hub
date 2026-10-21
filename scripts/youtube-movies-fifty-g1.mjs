// G1 only: discover a diverse 50-title candidate sample FROM YouTube Movies search.
// This is a bounded research report, NOT a catalog importer, provider feed or rights checker.
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle,getRegionSignal} from './youtube-api-smoke.mjs'

export const TARGET_TITLES=50
export const MAX_SEARCH_CALLS=20
export const MAX_VIDEO_CALLS=8
export const MAX_TMDb_CALLS=105
export const MAX_YOUTUBE_QUOTA=2100
export const PER_QUERY_DETAIL_IDS=20
export const QUERY_STRATA=Object.freeze([
  {name:'DE Klassiker',q:'Klassiker Film'},
  {name:'DE Science-Fiction',q:'Science Fiction Film'},
  {name:'DE Action',q:'Actionfilm'},
  {name:'DE Horror',q:'Horrorfilm'},
  {name:'DE Komödie',q:'Komödie Film'},
  {name:'DE Drama',q:'Drama Film'},
  {name:'DE Thriller',q:'Thriller Film'},
  {name:'DE Animation',q:'Animationsfilm'},
  {name:'DE Familie',q:'Familienfilm'},
  {name:'DE Abenteuer',q:'Abenteuerfilm'},
  {name:'DE Krimi',q:'Krimi Film'},
  {name:'DE Doku',q:'Dokumentarfilm'},
  {name:'1970er',q:'Film 1970er'},
  {name:'1980er',q:'Film 1980er'},
  {name:'1990er',q:'Film 1990er'},
  {name:'2000er',q:'Film 2000er'},
  {name:'2010er',q:'Film 2010er'},
  {name:'2020er',q:'Film 2020er'},
  {name:'EN classics',q:'classic movies'},
  {name:'EN international',q:'world cinema movies'}
])
const emptyResults={items:[]}
function cleanTitle(value){return safeTitle(value).trim()}
export function normalizedTitle(value){
 return cleanTitle(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
   .replace(/\b(19|20)\d{2}\b/g,'')
   .replace(/[^a-z0-9]/gi,'').toLowerCase()
}
export function minutes(value){
 const m=String(value||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
 if(!m||(!m[1]&&!m[2]&&!m[3]))return null
 return Number(m[1]||0)*60+Number(m[2]||0)+Number(m[3]||0)/60
}
export function storeChannelLabel(value){
 return /^(youtube movies(?:\s*&\s*tv)?|filme\s*&\s*shows von youtube)$/i.test(String(value||'').trim())
}
export function deAssessment(restriction){
 if(Array.isArray(restriction?.blocked)&&restriction.blocked.includes('DE'))return 'excluded'
 if(Array.isArray(restriction?.allowed))return restriction.allowed.includes('DE')?'allowed':'excluded'
 return 'unknown'
}
export function selectFifty(discoveries,detailMap,limit=TARGET_TITLES){
 const perStratum=discoveries.map(d=>({name:d.name,candidates:d.hits.filter(hit=>{
   const v=detailMap.get(hit.videoId)
   return v&&v.status?.privacyStatus!=='private' &&
     storeChannelLabel(v.snippet?.channelTitle) &&
     minutes(v.contentDetails?.duration)>=60 &&
     deAssessment(v.contentDetails?.regionRestriction)!=='excluded'
 })}))
 const result=[],ids=new Set(),titles=new Set()
 let progress=true
 for(let rank=0;rank<PER_QUERY_DETAIL_IDS&&progress&&result.length<limit;rank++){
  progress=false
  for(const row of perStratum){
   if(result.length>=limit)break
   const hit=row.candidates[rank]
   if(!hit)continue
   progress=true
   const v=detailMap.get(hit.videoId)
   const title=cleanTitle(v.snippet?.title)
   const key=normalizedTitle(title)
   if(!key||titles.has(key)||ids.has(hit.videoId))continue
   ids.add(hit.videoId);titles.add(key)
   result.push({videoId:hit.videoId,title,channel:cleanTitle(v.snippet.channelTitle),
     channelId:String(v.snippet.channelId||'').slice(0,80),
     duration:String(v.contentDetails?.duration||''),runtimeMinutes:minutes(v.contentDetails?.duration),
     deSignal:getRegionSignal(v.contentDetails?.regionRestriction),
     region:deAssessment(v.contentDetails?.regionRestriction),
     stratum:row.name,searchRank:hit.rank,
     titleEvidence:'youtube-data-api',filmMatch:'unverified'})
  }
 }
 return result
}
export function assessTmdb(title,candidates,detail){
 const exact=(Array.isArray(candidates)?candidates:[]).filter(x=>
   [x?.title,x?.original_title].some(t=>normalizedTitle(t)===normalizedTitle(title)))
 const ids=[...new Set(exact.map(x=>Number(x.id)).filter(x=>Number.isInteger(x)&&x>0))]
 if(!ids.length)return {status:'unmatched-or-title-variant',tmdbId:null,year:null,reason:'no-exact-alias'}
 if(ids.length>1)return {status:'ambiguous-review',tmdbId:null,year:null,reason:'multiple-exact-tmdb-identities'}
 const candidate=exact.find(x=>Number(x.id)===ids[0])
 return {status:'title-exact-review',tmdbId:ids[0],
   year:String(candidate.release_date||'').slice(0,4)||null,reason:'runtime-not-checked'}
}
export async function run({youtubeApi,tmdbGet,at=()=>new Date().toISOString()}={}){
 if(typeof youtubeApi!=='function'||typeof tmdbGet!=='function')throw Error('G1 requires both read-only API callbacks')
 let searchCalls=0,videoCalls=0,tmdbCalls=0,quota=0
 async function youtube(endpoint,params){
  const cost=endpoint==='search'?100:1
  if(quota+cost>MAX_YOUTUBE_QUOTA)throw Error('YouTube G1 quota hard cap')
  if(endpoint==='search'&&searchCalls>=MAX_SEARCH_CALLS)throw Error('YouTube G1 search hard cap')
  if(endpoint==='videos'&&videoCalls>=MAX_VIDEO_CALLS)throw Error('YouTube G1 videos hard cap')
  quota+=cost
  if(endpoint==='search')searchCalls++
  if(endpoint==='videos')videoCalls++
  return youtubeApi(endpoint,params)
 }
 async function tmdb(path,params){
  if(tmdbCalls>=MAX_TMDb_CALLS)throw Error('TMDB G1 hard cap')
  tmdbCalls++
  return tmdbGet(path,params)
 }
 const discoveries=[]
 for(const row of QUERY_STRATA){
  const data=await youtube('search',{part:'snippet',type:'video',videoType:'movie',
   regionCode:'DE',relevanceLanguage:row.name.startsWith('EN')?'en':'de',
   q:row.q,maxResults:50})
  const hits=[]
  for(const result of (data.items||[]).slice(0,PER_QUERY_DETAIL_IDS)){
   const id=result?.id?.videoId
   if(isVideoId(id))hits.push({videoId:id,rank:hits.length+1})
  }
  discoveries.push({name:row.name,q:row.q,hits})
 }
 const ids=[...new Set(discoveries.flatMap(x=>x.hits.map(y=>y.videoId)))]
 const details=new Map()
 for(let i=0;i<ids.length;i+=50){
  const data=await youtube('videos',{part:'snippet,contentDetails,status',id:ids.slice(i,i+50).join(',')})
  for(const v of data.items||[])if(isVideoId(v.id))details.set(v.id,v)
 }
 const chosen=selectFifty(discoveries,details)
 const tmdbMatches=[]
 for(const item of chosen){
  let res
  try{
   const s=await tmdb('/search/movie',{language:'de-DE',query:item.title,include_adult:'false'})
   const assessment=assessTmdb(item.title,s.results)
   res={...assessment}
   if(assessment.tmdbId!==null){
    // Even an identical title is only a provisional hint. Never auto-accept as a film match.
    const detail=await tmdb('/movie/'+assessment.tmdbId,{language:'de-DE'})
    const tmdbRuntime=Number(detail.runtime)
    const delta=Number.isFinite(tmdbRuntime)&&tmdbRuntime>0
      ?Math.round(Math.abs(item.runtimeMinutes-tmdbRuntime)*10)/10:null
    res={...assessment,runtimeDelta:delta,
      status:delta!==null&&delta<=15?'plausible-review':'title-exact-review'}
   }
  }catch(err){
   // TMDB errors must not transform an unverified YouTube candidate into a positive match.
   res={status:'tmdb-query-error',tmdbId:null,year:null,reason:String(err?.message||'TMDB failure').slice(0,60)}
  }
  tmdbMatches.push({...item,...res})
 }
 const groups={}
 for(const row of tmdbMatches)groups[row.status]=(groups[row.status]||0)+1
 const lines=[
  '# YouTube Movies G1 - YouTube-first 50 title candidates','',
  '- Run: '+at(),
  '- TARGET: **50 distinct YouTube Movies movie-title candidates**; ACTUAL: **'+chosen.length+'**. Less than 50 is a coverage finding, NOT success masquerading as 50.',
  '- YouTube requests: '+searchCalls+' search.list + '+videoCalls+' batched videos.list. Estimated API quota: '+quota+'/'+MAX_YOUTUBE_QUOTA+'. TMDB requests: '+tmdbCalls+'/'+MAX_TMDb_CALLS+'.',
  '- Channel label, full runtime and DE regionRestrictions are **screening signals**, not official shop/rights/price verification; title+TMDB ID is provisional only.',
  '- YouTube-first genre/era queries are discoverability sampling, NOT a complete DE film-shop feed. Movie metadata / year / offers remain TMDB-first and separately sourced.',
  '- No Firestore, catalog, badges, provider availability, automatic matching, purchases or APK updates.',
  '',
  '## Filter funnel','',
  '- API search video IDs (unique, first '+PER_QUERY_DETAIL_IDS+' per stratum): '+ids.length,
  '- videos.list returned: '+details.size,
  '- 60-minute+ YouTube-Movies channel label / DE-not-explicitly-excluded / title-dedup: '+chosen.length,
  '- Distinct tentative TMDB ID hints are NOT productively accepted.',
  ...Object.entries(groups).map(([k,v])=>'- '+k+': '+v),
  '',
  '## Selected candidate titles: up to 50','',
  '| # | YouTube Movie title | Video-ID | Source stratum | Runtime | DE metadata | TMDB candidate ID | TMDB status |',
  '| ---: | --- | --- | --- | ---: | --- | ---: | --- |',
  ...tmdbMatches.map((x,i)=>'| '+(i+1)+' | '+cleanTitle(x.title)+' | '+x.videoId+
    ' | '+x.stratum+' | '+(Math.round(x.runtimeMinutes*10)/10)+' min | '+x.deSignal+
    ' | '+(x.tmdbId||'?')+' | '+x.status+' |'),
  '',
  '## YouTube search strata, IDs considered (NOT verified movies)','',
  '| Source stratum | Query | Video IDs (top '+PER_QUERY_DETAIL_IDS+') |',
  '| --- | --- | ---: |',
  ...discoveries.map(x=>'| '+x.name+' | '+x.q+' | '+x.hits.length+' |'),
  '',
  '## Quality and continuation','',
  '- A similar title, matching runtime, a known-sounding YouTube channel name or region allowlist **does not authorize automatic TMDB identity or YouTube monetization**.',
  '- German YouTube movie IDs and shop entries might not be in the first results, as confirmed by earlier G1 checks.',
  '- Do not copy the 200-video publisher playlist inventory into this YouTube-owned Movies sample.',
  '- Review ambiguous/year-conflict cases; sample Fire TV and Android exact targets before proposing G2. Find a legitimate repeatable source or report honest coverage limits.',
  '- G1 remains open, G2-G4 not approved. No production MovieHub changes.',
  ''
 ]
 return {chosen:tmdbMatches,counts:{searchCalls,videoCalls,tmdbCalls,quota,
   youtubeUniqueIds:ids.length,videoDetails:details.size},report:lines.join('\n')}
}
async function tmdbFromToken(path,params,token){
 const uri=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params||{}))uri.searchParams.set(k,String(v))
 let r
 try{r=await fetch(uri,{headers:{accept:'application/json',Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(12000)})}catch{throw Error('TMDB network failure')}
 if(!r.ok)throw Error('TMDB HTTP '+r.status)
 return r.json()
}
async function main(){
 const key=getSecret(),token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB_API_READ_TOKEN secret missing')
 const result=await run({youtubeApi:(e,p)=>youtubeGet(e,p,key),
   tmdbGet:(p,q)=>tmdbFromToken(p,q,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile('artifacts/youtube-movies-g1/fifty-youtube-first.md',result.report+'\n',{mode:0o600})
 console.log('Read-only YouTube Movies fifty-target G1 complete. Actual selected: '+result.chosen.length+
   '; YouTube quota: '+result.counts.quota+'; details and TMDB hints in temporary artifact only.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error('G1 fifty-movies research failed: '+String(e?.message||'unknown').slice(0,130));process.exitCode=1})
}
