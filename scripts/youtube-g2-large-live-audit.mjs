/**
 * 125 NEW eligible video IDs: one publisher, actual YouTube/TMDB live API.
 * Frozen matcher v1; ZERO catalog/Firestore/provider/badge/nightly writes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet, SOURCES } from './youtube-api-smoke.mjs'
import { previouslyReviewedYouTubeIds } from './youtube-g2-prior-video-ids.mjs'
import { prepareYouTubeMovieSearchTitle } from './youtube-g2-title-query-prep.mjs'
import { scoreCandidate, classifyVideo } from './youtube-g1-matcher-v1.mjs'
import { normalizeYoutubeVideoCandidate } from '../src/sources/adapters/youtubeContractMapper.js'
import { buildYoutubeTitleImportPreview } from '../src/sources/youtubeTitleImportPreview.js'

export const TARGET = 125
export const MAX_PAGES = 12
export const MAX_YOUTUBE = 26
export const MAX_TMDB = 800
export const OUTPUT_DIR = 'artifacts/youtube-g2/large-125'
const VIDEO = /^[A-Za-z0-9_-]{11}$/
const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/
const clean = v => String(v ?? '').replace(/[<>\r\n|]/g, ' ').replace(/\s+/g,' ').trim().slice(0,135)
const positiveId = v => Number.isInteger(Number(v)) && Number(v)>0 ? Number(v) : null
const unique = v => [...new Set(v)]
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms))

export async function runYoutubeLargeAudit({
 youtube,tmdb,source=SOURCES[1],priorIds=previouslyReviewedYouTubeIds,
 knownTitleRefs=null,target=TARGET,maxPages=MAX_PAGES,
 now=()=>new Date().toISOString(),
}={}) {
 if(typeof youtube!=='function'||typeof tmdb!=='function')throw Error('Read-only API callbacks required')
 if(!CHANNEL.test(source?.channelId||''))throw Error('Exactly ONE valid publisher channel required')
 if(!Number.isInteger(target)||target<101||target>TARGET)throw Error('Target must be 101..125')
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES)throw Error('Max playlist pages invalid')
 if(!Array.isArray(priorIds)||priorIds.some(x=>!VIDEO.test(x)))throw Error('Historical exclusions invalid')
 const excluded=new Set(priorIds)
 const runAt=new Date(now()).toISOString()
 let youtubeCalls=0,tmdbCalls=0,examined=0,resolved=0,oldSkipped=0,screenedOut=0,pages=0
 const yget=async(p,q)=>{
  if(!['channels','playlistItems','videos'].includes(p)||++youtubeCalls>MAX_YOUTUBE)
   throw Error('HARD_STOP_YOUTUBE_QUOTA')
  return youtube(p,q)
 }
 const tget=async(p,q)=>{
  if(!/^\/(?:search\/movie|search\/tv|movie\/[1-9]\d*)$/.test(p))
   throw Error('Disallowed TMDB endpoint')
  if(tmdbCalls>=MAX_TMDB)throw Error('HARD_STOP_TMDB_QUOTA')
  tmdbCalls++
  return tmdb(p,q)
 }
 const channel=(await yget('channels',{part:'snippet,contentDetails',id:source.channelId}))
  ?.items?.find(x=>x.id===source.channelId)
 const uploads=channel?.contentDetails?.relatedPlaylists?.uploads
 if(!uploads)throw Error('Official uploads playlist missing')
 const seen=new Set(),selected=[]
 let token=null
 for(let n=0;n<maxPages && selected.length<target;n++){
  const args={part:'snippet,contentDetails',playlistId:uploads,maxResults:50}
  if(token)args.pageToken=token
  const page=await yget('playlistItems',args)
  if(!Array.isArray(page?.items))throw Error('Playlist page invalid')
  pages++
  const ids=[]
  for(const item of page.items){
   const id=item?.contentDetails?.videoId
   if(!VIDEO.test(id||'')||seen.has(id))continue
   seen.add(id);examined++
   if(excluded.has(id)){oldSkipped++;continue}
   ids.push(id)
  }
  for(let i=0;i<ids.length&&selected.length<target;i+=50){
   const batch=ids.slice(i,i+50)
   const raw=await yget('videos',{part:'snippet,contentDetails,status',id:batch.join(',')})
   if(!Array.isArray(raw?.items))throw Error('Video metadata missing')
   const index=new Map(raw.items.map(v=>[v.id,v]))
   for(const id of batch){
    const video=index.get(id)
    if(!video)continue
    resolved++
    if(video?.snippet?.channelId!==source.channelId)throw Error('CROSS_CHANNEL_SOURCE_ABORT')
    const normalized=normalizeYoutubeVideoCandidate(video,{observedAt:runAt})
    if(!normalized?.screening?.eligible){screenedOut++;continue}
    selected.push(normalized)
    if(selected.length>=target)break
   }
  }
  token=page.nextPageToken||null
  if(!token)break
 }
 if(selected.length<target)
  throw Error('INSUFFICIENT_NEW_ELIGIBLE_IDS: '+selected.length+'/'+target+
   ' from '+pages+' pages; no TMDB calls; no import')
 const cache=new Map()
 const cached=async(p,q)=>{
  const key=p+':'+JSON.stringify(q)
  if(cache.has(key))return cache.get(key)
  const value=await tget(p,q)
  cache.set(key,value)
  return value
 }
 const rows=[]
 for(const video of selected){
  const prepared=prepareYouTubeMovieSearchTitle(video.title)
  const v1Input={title:prepared.matchingTitle,minutes:video.minutes,
   category:video.category,region:video.deRegionSignal}
  const scored=[],errors=[],movieIds=[]
  let tvIds=[]
  try{
   for(const query of prepared.queries){
    const m=await cached('/search/movie',{language:'de-DE',query,include_adult:'false',page:1})
    movieIds.push(...(m.results||[]).slice(0,3).map(x=>positiveId(x.id)).filter(Boolean))
   }
   const tv=await cached('/search/tv',{
    language:'de-DE',query:prepared.matchingTitle,include_adult:'false',page:1,
   })
   tvIds=unique((tv.results||[]).map(x=>positiveId(x.id)).filter(Boolean)).slice(0,3)
   for(const id of unique(movieIds).slice(0,3)){
    const movie=await cached('/movie/'+id,{
     language:'de-DE',append_to_response:'alternative_titles,credits,external_ids',
    })
    if(Number(movie?.id)!==id)throw Error('TMDB film ID mismatch')
    scored.push(scoreCandidate(v1Input,movie))
   }
  }catch(e){
   errors.push(clean(e?.message))
   if(/HARD_STOP|quota|429|403|rate.limit/i.test(e?.message||''))
    throw Error('PARTIAL_BATCH_ABORT: '+rows.length+'/'+target+'; '+clean(e?.message))
  }
  const verdict=classifyVideo(v1Input,scored,tvIds,{
   incomplete:errors.length>0,asOfYear:Number(runAt.slice(0,4)),
  })
  rows.push({video,prepared,verdict,errors})
 }
 const preview=buildYoutubeTitleImportPreview(rows,{knownTitleRefs,reportGeneratedAt:runAt})
 const statuses={},leadingWorks=new Set()
 for(const row of rows){
  const s=row.verdict.status
  statuses[s]=(statuses[s]||0)+1
  if(s.startsWith('review-leading-')&&row.verdict.topCandidates?.[0]?.tmdbId)
   leadingWorks.add(row.verdict.topCandidates[0].tmdbId)
 }
 const summary={
  generatedAt:runAt,mode:'READ_ONLY_G2_SINGLE_CHANNEL_STRESS',
  publisherChannelId:source.channelId,
  knownExclusions:excluded.size,
  examinedPlaylistVideoIds:examined,resolvedVideoMetadata:resolved,
  previouslyKnownIdsExcluded:oldSkipped,screenedOut,
  pages,youtubeCalls,tmdbCalls,
  newEligibleUniqueVideos:rows.length,target,
  matcherStatuses:statuses,leadingUniqueTmdbHypotheses:leadingWorks.size,
  catalogStatus:preview.catalogStatus,previewCounts:preview.counts,
  independentlyConfirmedMovies:0,verifiedDEOffers:0,
  catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  publicationPermitted:false,
 }
 if(rows.length!==target||rows.some(x=>x.video.channelId!==source.channelId))
  throw Error('Batch or source integrity failure')
 const report=[
  '# YouTube G2 – Live-Stresstest mit 125 NEUEN Film-Video-Kandidaten','',
  '- Run: '+runAt,
  '- EIN Publisher/Channel: '+source.channelId,
  '- IDs in archivierten G1-100/G2-20-Referenzlisten ausgeschlossen: '+excluded.size,
  '- Gescreente Playlist-IDs: '+examined+'; Videos-Metadaten: '+resolved+
    '; davon alte: '+oldSkipped+'; neu aber ausgeschlossen: '+screenedOut,
  '- **Neue, voneinander verschiedene screen-geeignete Video-IDs: '+rows.length+'/'+target+'**',
  '- YouTube-Abfragen: '+youtubeCalls+'/'+MAX_YOUTUBE+'; Playlist-Seiten: '+pages,
  '- TMDB-Abfragen: '+tmdbCalls+'/'+MAX_TMDB,
  '- V1-Statusverteilung: '+JSON.stringify(statuses),
  '- Unterschiedliche führende TMDB-Filmhypothesen: '+leadingWorks.size,
  '- Katalogvergleich: '+preview.catalogStatus+' (ohne echten Katalog keine neuen Titel behaupten)',
  '- Unabhängig verifizierte Werke: 0; bestätigte deutsche Anbieterangebote: 0.',
  '- **NO DATA IMPORT: Catalog/Firestore/Provider/Badge/Nightly writes all ZERO.**',
  '- YouTube-Titel, Laufzeit und Regionsmetadaten belegen weder Rechte noch Vollfilm noch DE-Verfügbarkeit.',
  '- Eine führende Matcher-Hypothese ist KEINE Trefferquotenmessung.','',
  '| Nr. | Video (Originaltitel) | Bereinigte Suchanfrage | Minuten | Matcher v1 | TMDB Top 3 |',
  '| ---: | --- | --- | ---: | --- | --- |',
  ...rows.map((r,i)=>'| '+(i+1)+' | ['+clean(r.video.title)+']('+r.video.watchUrl+') | '+
   clean(r.prepared.matchingTitle)+' | '+r.video.minutes+' | '+r.verdict.status+
   (r.errors.length?' ERROR '+clean(r.errors.join(', ')):'')+' | '+
   (r.verdict.topCandidates||[]).map(x=>x.tmdbId+' (Δ'+(x.runtimeDelta??'?')+'min)').join(', ')+' |'),
  '', '## Prüffragen für gesamten Adapter',
  '- Abruf: Paging/Quota/DE-Quelle, Duplikate, zurückgezogene Videos, Fehlerversuche',
  '- Matching: deutsche Originaltitel, Schauspieler-/Marketing-Texte, Remakes, Fassungen, Episoden, Konflikte',
  '- Katalog: vorhandene Titel vs. neue Werke anhand ECHTEM MovieHub-TMDB-ID-Bestand (nicht leerem Fallback)',
  '- Pipeline: kanonische SourceEnvelope/Availability/PlaybackRoutes und Deduplizierung',
  '- Frontend: zentrale Badge-Reihenfolge, Poster/Detail-Übereinstimmung, Fire-TV-YouTube-Deep-Link',
  '- Betrieb: prüfbare Offer-/DE-Rechte, API-Datenretention, Revocation, Nightly/Watchdog, Rollback',
  '- API-Policies III.E.2 beachten; Einbenutzerbetrieb schafft keine ausdrückliche Ausnahme.',
  '',
 ]
 return {rows,summary,report:report.join('\n')}
}
async function tmdbLive(path,params,token){
 const url=new URL('https://api.themoviedb.org/3'+path)
 Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)))
 await sleep(110)
 const r=await fetch(url,{headers:{accept:'application/json',authorization:'Bearer '+token},
  signal:AbortSignal.timeout(16000)})
 if(!r.ok)throw Error('TMDB HTTP '+r.status)
 return r.json()
}
async function main(){
 const token=process.env.TMDB_API_READ_TOKEN
 if(!token||token.length<15)throw Error('TMDB read token not configured')
 if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('No write mode in audit')
 let knownTitleRefs=null
 const catalogFile=process.env.YOUTUBE_G2_READONLY_CATALOG_SNAPSHOT
 if(catalogFile){
  const c=JSON.parse(await readFile(catalogFile,'utf8'))
  if(c.source==='fallback'||!Array.isArray(c.titles))throw Error('Cannot use fallback catalog')
  knownTitleRefs=c.titles.map(x=>({mediaType:x.type==='series'?'series':'movie',tmdbId:x.tmdbId}))
 }
 const key=getSecret()
 const {summary,report,rows}=await runYoutubeLargeAudit({
  knownTitleRefs,
  youtube:(p,q)=>youtubeGet(p,q,key),
  tmdb:(p,q)=>tmdbLive(p,q,token),
 })
 await mkdir(OUTPUT_DIR,{recursive:true})
 await writeFile(OUTPUT_DIR+'/report.md',report+'\n',{mode:0o600})
 await writeFile(OUTPUT_DIR+'/qa.json',JSON.stringify({
  summary,cases:rows.map(({video,prepared,verdict,errors})=>({
   videoId:video.videoId,title:video.title,channelId:video.channelId,
   minutes:video.minutes,query:prepared.matchingTitle,status:verdict.status,
   topCandidates:verdict.topCandidates,errors,workConfirmed:false,offerConfirmed:false,
  })),
 },null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({success:true,count:summary.newEligibleUniqueVideos,
  youtubeCalls:summary.youtubeCalls,tmdbCalls:summary.tmdbCalls,
  catalogWrites:0,firestoreWrites:0}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('YouTube G2 batch failed closed: '+clean(e.message));process.exitCode=1})
