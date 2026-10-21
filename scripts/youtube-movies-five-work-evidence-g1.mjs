// G1-only exact-work evidence probe for five previously found YouTube VIDEO IDs.
// Never accepts a TMDB match or publishes a catalog, offer, badge, or playable route.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet,isVideoId,safeTitle,getRegionSignal} from './youtube-api-smoke.mjs'
import {minutes,deAssessment} from './youtube-movies-fifty-g1.mjs'

export const INPUT='docs/_work/YOUTUBE_MOVIES_G1_FIVE_WORK_IDENTITY_SEEDS_2026-10-21.json'
export const OUTPUT='artifacts/youtube-movies-g1/five-work-evidence.md'
export const MAX_YOUTUBE_READS=1
export const MAX_TMDB_READS=5
const clean=x=>String(x??'').replace(/[\r\n|<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,145)
const norm=x=>clean(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]/g,'')
const validYear=n=>Number.isInteger(Number(n))&&Number(n)>=1900&&Number(n)<=2100
const validFilmId=id=>Number.isInteger(Number(id))&&Number(id)>0
const safeLines=s=>String(s||'').split(/\r?\n/).slice(0,200).map(x=>x.slice(0,500))
const imdbIds=s=>[...new Set((String(s||'').match(/\btt\d{7,9}\b/gi)||[]).map(x=>x.toLowerCase()))].slice(0,6)
const labelledYear=lines=>{
 const found=[]
 for(const line of lines){
  const m=line.match(/(?:\b(?:release\s*year|released|production\s*year|erscheinungsjahr|año\s*de\s*producci[oó]n|film\s*year)\b)\s*[:=-]?\s*((?:19|20)\d{2})\b/i)
  if(m)found.push(Number(m[1]))
 }
 return [...new Set(found)].slice(0,5)
}
const labelledDirector=lines=>{
 const values=[]
 for(const line of lines){
  const m=line.match(/^\s*(?:directed\s+by|director|regie|regisseur|directed|direcci[oó]n)\s*[:=-]\s*(.+)$/i)
  if(m)values.push(clean(m[1]).slice(0,90))
 }
 return values.slice(0,6)
}
export function validate(m){
 if(m?.schemaVersion!==1||m?.referenceRunId!==39609488229||
  m?.referenceArtifactId!==12349258409||!Array.isArray(m?.candidates)||
  m.candidates.length!==5)throw Error('G1 five source manifest mismatch')
 const ids=new Set(),films=new Set()
 for(const c of m.candidates){
  if(!isVideoId(c.videoId)||!validFilmId(c.tmdbMovieId)||!validYear(c.releaseYear)||
   !Number.isFinite(c.observedYoutubeMinutes)||c.observedYoutubeMinutes<60||
   !clean(c.youtubeTitle)||!clean(c.expectedDirector)||ids.has(c.videoId)||
   films.has(c.tmdbMovieId))throw Error('G1 five invalid or duplicate evidence')
  ids.add(c.videoId);films.add(c.tmdbMovieId)
 }
 return m.candidates
}
function filmEvidence(seed,movie,video){
 const row={videoId:seed.videoId,seedTmdbId:seed.tmdbMovieId,
  sourceTitle:seed.youtubeTitle,sourceStatus:'unresolved',
  youtubeChannelId:null,videoPublic:false,deSignal:'unknown',youtubeRuntime:null,
  filmTitle:clean(movie?.title),originalTitle:clean(movie?.original_title),
  filmYear:Number(String(movie?.release_date||'').slice(0,4))||null,
  director:[],tmdbRuntime:Number(movie?.runtime)||null,
  imdbSource:[],imdbTmdb:movie?.external_ids?.imdb_id||null,
  imdbCrosscheck:'not-listed',descriptionDirectorCrosscheck:'not-listed',
  youtubeDescriptionYear:[],yearCrosscheck:'not-listed',
  titleCrosscheck:'not-matched',runtimeDifference:null,disposition:'review',
  confirmedFilm:false,confirmedDEPlayback:false,confirmedRights:false,confirmedOffer:false}
 if(!video){row.sourceStatus='video-not-resolved';row.disposition='review-video-unavailable';return row}
 row.youtubeChannelId=clean(video?.snippet?.channelId||'')||null
 row.videoPublic=video?.status?.privacyStatus==='public'
 row.deSignal=deAssessment(video?.contentDetails?.regionRestriction)
 row.youtubeRuntime=minutes(video?.contentDetails?.duration)
 row.sourceStatus=row.videoPublic?'public':'not-public'
 const lines=safeLines(video?.snippet?.description)
 row.imdbSource=imdbIds(lines.join('\n'))
 row.youtubeDescriptionYear=labelledYear(lines)
 const directors=(movie?.credits?.crew||[]).filter(x=>x?.job==='Director').map(x=>clean(x.name))
 row.director=[...new Set(directors)].slice(0,8)
 const tmdbAliases=[movie?.title,movie?.original_title,
  ...(movie?.alternative_titles?.titles||[]).map(x=>x.title),
  seed.originalTitle,seed.knownAlias].map(norm).filter(Boolean)
 const title=norm(video?.snippet?.title)
 row.titleCrosscheck=tmdbAliases.includes(title)?'full-title-alias':
   tmdbAliases.some(x=>x.length>=5&&(title.includes(x)||x.includes(title)))?
   'partial-title-alias':'no-title-alias'
 const labelled=labelledDirector(lines).map(norm)
 if(labelled.length&&directors.length){
  row.descriptionDirectorCrosscheck=labelled.some(x=>directors.some(y=>
   x===norm(y)||x.includes(norm(y))||norm(y).includes(x)))?
   'same-director-listed':'director-label-conflict'
 }
 if(row.imdbSource.length&&row.imdbTmdb){
  row.imdbCrosscheck=row.imdbSource.includes(String(row.imdbTmdb).toLowerCase())?
   'exact-imdb-id-listed':'different-imdb-id-listed'
 }
 if(row.youtubeDescriptionYear.length&&row.filmYear){
  row.yearCrosscheck=row.youtubeDescriptionYear.includes(row.filmYear)?
   'release-year-listed':'release-year-conflict'
 }
 if(Number.isFinite(row.tmdbRuntime)&&row.tmdbRuntime>0&&row.youtubeRuntime!==null){
  row.runtimeDifference=Math.round(Math.abs(row.tmdbRuntime-row.youtubeRuntime)*10)/10
 }
 // Explicit fail-closed review gate. Never turn contentDetails, status or plain title+length into approved catalog state.
 if(!row.videoPublic)row.disposition='review-video-not-public'
 else if(row.deSignal==='excluded')row.disposition='review-DE-region-excluded'
 else if(row.youtubeRuntime===null||row.youtubeRuntime<60)row.disposition='review-video-duration'
 else if(row.filmYear!==seed.releaseYear)row.disposition='review-film-year-conflict'
 else if(!directors.some(x=>norm(x)===norm(seed.expectedDirector)))row.disposition='review-film-crew-conflict'
 else if(row.imdbCrosscheck==='different-imdb-id-listed'||
   row.descriptionDirectorCrosscheck==='director-label-conflict'||
   row.yearCrosscheck==='release-year-conflict')
   row.disposition='review-cross-source-conflict'
 else if(row.runtimeDifference===null||row.runtimeDifference>15)
   row.disposition='review-version-runtime-conflict'
 else if(row.imdbCrosscheck==='exact-imdb-id-listed')
   row.disposition='review-direct-identifier-support'
 else if(row.descriptionDirectorCrosscheck==='same-director-listed'&&
    row.titleCrosscheck!=='no-title-alias')
   row.disposition='review-director-support'
 else row.disposition='review-title-runtime-only'
 return row
}
export async function auditFive({manifest,youtubeApi,tmdbGet,at=()=>new Date().toISOString()}={}){
 const seeds=validate(manifest)
 if(typeof youtubeApi!=='function'||typeof tmdbGet!=='function')
  throw Error('Read-only callbacks required')
 let youtubeCalls=0,tmdbCalls=0
 youtubeCalls++
 const data=await youtubeApi('videos',{
  part:'snippet,contentDetails,status',id:seeds.map(s=>s.videoId).join(',')})
 if(!Array.isArray(data?.items))throw Error('YouTube five not a valid videos response')
 const videos=new Map(data.items.filter(x=>isVideoId(x.id)).map(x=>[x.id,x]))
 const rows=[]
 for(const seed of seeds){
  if(tmdbCalls>=MAX_TMDB_READS)throw Error('TMDB G1 hard cap')
  tmdbCalls++
  try{
   const details=await tmdbGet('/movie/'+seed.tmdbMovieId,
    {language:'de-DE',append_to_response:'credits,alternative_titles,external_ids'})
   if(Number(details?.id)!==seed.tmdbMovieId)throw Error('TMDB ID mismatch')
   rows.push(filmEvidence(seed,details,videos.get(seed.videoId)))
  }catch(e){
   rows.push({videoId:seed.videoId,seedTmdbId:seed.tmdbMovieId,
    sourceTitle:seed.youtubeTitle,disposition:'review-tmdb-error',
    error:String(e?.message||'fetch failed').slice(0,70),
    confirmedFilm:false,confirmedDEPlayback:false,confirmedRights:false,confirmedOffer:false})
  }
 }
 const statuses={}
 for(const r of rows)statuses[r.disposition]=(statuses[r.disposition]||0)+1
 const lines=[
 '# MovieHub G1 – five strongest YouTube-first work/version evidence probes','',
 '- Generated at: '+at(),
 '- Exact source: verified G1 21-case run #39609488229 / artifact #12349258409.',
 '- Read-only operations: YouTube videos.list '+youtubeCalls+'/'+MAX_YOUTUBE_READS+
  ', TMDB movie append-to-response '+tmdbCalls+'/'+MAX_TMDB_READS+'.',
 '- No new YouTube search/discover, playlists, channel aggregation, TMDB provider seeds or provider offer claims.',
 '- Video status, embed signal and DE region metadata do not establish current Germany shop rights, entitlement or playback.',
 '- Director/year/IMDb evidence is extracted only from labelled public YouTube-description fields when available.',
 '- The raw YouTube descriptions are NOT written or echoed; only crosscheck verdicts. All identities remain unconfirmed.',
 '- Result of every candidate is REVIEW. No automatic TMDB assignment and no app, DB, badge, nightly or playback changes.','',
 '## Status counts','',
 '| Diagnostic verdict | Cases |','| --- | ---: |',
 ...Object.entries(statuses).sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([k,n])=>'| '+k+' | '+n+' |'),'',
 '## Separate exact-ID evidence diagnostics (NOT imported titles)','',
 '| Public YouTube video | Proposed TMDB film | Release year | Director(s) per TMDB | Runtime delta (min) | YouTube metadata cues (year/director/IMDb) | Review |',
 '| --- | ---: | --- | --- | ---: | --- | --- |',
 ...rows.map(r=>'| ['+safeTitle(r.sourceTitle)+'](https://www.youtube.com/watch?v='+r.videoId+
  ') | '+r.seedTmdbId+' | '+(r.filmYear??'?')+' | '+
  (r.director?.join('; ')||'?')+' | '+(r.runtimeDifference??'?')+
  ' | '+[r.yearCrosscheck,r.descriptionDirectorCrosscheck,r.imdbCrosscheck]
    .filter(Boolean).join(' / ')+
  ' | '+r.disposition+' |'),
 '',
 '## Hard gates still open','',
 '- Confirm exact film cut/version independent of title/runtime, and validate a real in-country shop/player availability via authorized user-facing test.',
 '- Confirm data aggregation rights for YouTube across content owners according to API Developer Policies before publishing in MovieHub.',
 '- Check canonical movie ID against current public catalog/indices; private MovieHub title holdings must not be inferred.',
 '- Never interpret a YouTube Movies channel label or metadata DE-allowed as a legally usable provider badge.',
 '- G1 issue #388 stays open, G2+ not approved.',
 ''
 ]
 return{rows,stats:{youtubeCalls,tmdbCalls,statuses},report:lines.join('\n')}
}
async function tmdbGet(path,params,token){
 const uri=new URL('https://api.themoviedb.org/3'+path)
 for(const [k,v] of Object.entries(params||{}))uri.searchParams.set(k,String(v))
 let res
 try{res=await fetch(uri,{headers:{accept:'application/json',
  Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)})}
 catch{throw Error('TMDB timeout/network')}
 if(!res.ok)throw Error('TMDB HTTP '+res.status)
 return res.json()
}
async function main(){
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB G1 read token missing')
 const manifest=JSON.parse(await readFile(INPUT,'utf8'))
 const key=getSecret()
 const outcome=await auditFive({manifest,
  youtubeApi:(endpoint,params)=>youtubeGet(endpoint,params,key),
  tmdbGet:(path,params)=>tmdbGet(path,params,token)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,outcome.report+'\n',{mode:0o600})
 console.log('G1 five film work-version signals: '+outcome.stats.youtubeCalls+
  ' Youtube read, '+outcome.stats.tmdbCalls+' TMDB reads. All review; no app changes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 five identity failed: '+
 String(e?.message||'unknown').slice(0,140));process.exitCode=1})
