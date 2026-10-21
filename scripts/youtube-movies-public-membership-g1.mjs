// G1 only: READ existing public MovieHub title IDs, compare 26 non-confirmed TMDB hints.
// No YouTube, TMDB, Firebase, Firestore, private account, or write API calls.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export const INPUT='docs/_work/YOUTUBE_MOVIES_G1_PUBLIC_MEMBERSHIP_SEEDS_2026-10-21.json'
export const OUTPUT='artifacts/youtube-movies-g1/public-membership-26.md'
export const URLS=Object.freeze({
 search:'https://movie-hub-62459.web.app/search-index.json',
 browse:'https://movie-hub-62459.web.app/catalog.json'
})
export const MAX_BYTES=40_000_000
const num=n=>Number.isInteger(Number(n))&&Number(n)>0?Number(n):null
export function checkSeeds(d){
 const ids=d?.tmdbMovieIdHints
 if(d?.schemaVersion!==1||!Array.isArray(ids)||ids.length!==26||
  new Set(ids).size!==26||ids.some(id=>num(id)===null))
  throw Error('Expected exactly 26 original unapproved movie IDs')
 return ids
}
export function summarizePublicArtifact(kind,doc){
 if(kind==='search'){
  if(doc?.kind!=='search-index'||doc.version!==1||
   !Array.isArray(doc.entries)||!doc.generatedAt||doc.entries.length<1)
   throw Error('Not a complete published PUBLIC search-index')
  const ids=new Set(doc.entries.filter(e=>e?.type==='movie'&&e?.scope!=='personal')
   .map(e=>num(e.tmdbId)).filter(Boolean))
  return{kind:'search-index',ids,records:doc.entries.length,generatedAt:doc.generatedAt}
 }
 if(kind==='browse'){
  if(!Array.isArray(doc?.titles)||doc.titles.length<1||doc?.source==='fallback'||!doc.generatedAt)
   throw Error('Not a complete published PUBLIC browse catalog')
  const ids=new Set(doc.titles.filter(e=>e?.type==='movie')
   .map(e=>num(e.tmdbId)).filter(Boolean))
  return{kind:'browse-catalog',ids,records:doc.titles.length,generatedAt:doc.generatedAt}
 }
 throw Error('Unsupported public resource')
}
export function compareSeeds(ids,search,browse){
 const rows=ids.map(tmdbId=>({tmdbId,
  inPublicSearch:search?search.ids.has(tmdbId):null,
  inPublicBrowse:browse?browse.ids.has(tmdbId):null}))
 const totals={
  publicSearchPresent:search?rows.filter(r=>r.inPublicSearch).length:null,
  publicBrowsePresent:browse?rows.filter(r=>r.inPublicBrowse).length:null,
  presentInBoth:search&&browse?rows.filter(r=>r.inPublicSearch&&r.inPublicBrowse).length:null,
  absentFromBothPublic:search&&browse?
   rows.filter(r=>!r.inPublicSearch&&!r.inPublicBrowse).length:null
 }
 return{rows,totals}
}
export async function getPublicJson(kind,fetchFn=fetch){
 const url=URLS[kind]
 if(!url)throw Error('Unexpected URL target')
 const r=await fetchFn(url,{headers:{accept:'application/json'},
  cache:'no-store',signal:AbortSignal.timeout(25000)})
 if(!r.ok)throw Error(kind+' HTTP '+r.status)
 if(Number(r.headers.get('content-length')||0)>MAX_BYTES)
  throw Error(kind+' byte cap before read')
 if(!r.body?.getReader)throw Error('Response stream missing')
 const reader=r.body.getReader(),chunks=[]
 let total=0
 while(true){
  const x=await reader.read()
  if(x.done)break
  total+=x.value.byteLength
  if(total>MAX_BYTES){await reader.cancel();throw Error(kind+' byte cap while reading')}
  chunks.push(x.value)
 }
 const bytes=new Uint8Array(total);let offset=0
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
}
export async function run({manifest,loadPublic,at=()=>new Date().toISOString()}={}){
 const ids=checkSeeds(manifest)
 if(typeof loadPublic!=='function')throw Error('Public GET callback required')
 const reads={}
 for(const kind of ['search','browse']){
  try{
   const data=await loadPublic(kind)
   reads[kind]={status:'checked',value:summarizePublicArtifact(kind,data)}
  }catch(error){reads[kind]={status:'unavailable-or-invalid',
   reason:String(error?.message||'network unavailable').slice(0,95)}}
 }
 const search=reads.search.value||null,browse=reads.browse.value||null
 const cmp=compareSeeds(ids,search,browse)
 const status=x=>x===null?'not-checked':x?'present':'not-in-this-PUBLIC-artifact'
 const lines=[
 '# G1 – Public MovieHub title membership of 26 provisional YouTube-first TMDB movie IDs','',
 '- Generated: '+at(),
 '- Historical source: G1 #39602961148 / artifact #12347785136. 26 **unverified** TMDB movie hints.',
 '- Read-only GETs: at most two published public MovieHub JSON artifacts. ZERO YouTube/TMDB API calls.',
 '- **These 26 IDs are NOT confirmed film-version or YouTube right/offer matches.**',
 '- PUBLIC search-index: '+reads.search.status+
   ' / generation '+(search?.generatedAt||'unknown')+
   ' / records '+(search?.records??'?')+'.',
 '- PUBLIC browse catalog: '+reads.browse.status+
   ' / generation '+(browse?.generatedAt||'unknown')+
   ' / records '+(browse?.records??'?')+'.',
 '- Search-index present: '+(cmp.totals.publicSearchPresent??'?')+'/26; browse present: '+
   (cmp.totals.publicBrowsePresent??'?')+'/26; neither public: '+
   (cmp.totals.absentFromBothPublic??'?')+'/26.',
 '- Absence from these PUBLIC lists does NOT mean the movie is absent from all MovieHub profiles or from TMDB.',
 '- No access to personal TMDB lists, account data, Firestore, Fire TV, or unpublished title inventories.',
 '- No changes to MovieHub public title data, Firebase, Firestore, providers, badges, APK, scheduler or source adapters.',
 '- G1 diagnostic only; G2+ not approved. Compliance for YouTube cross-owner API data remains open.','',
 '| Unverified TMDB movie-ID hint | Public Search Index | Public Browse Catalog |',
 '| ---: | --- | --- |',
 ...cmp.rows.map(x=>'| '+x.tmdbId+' | '+status(x.inPublicSearch)+
  ' | '+status(x.inPublicBrowse)+' |'),
 '',
 '## Interpretation','',
 '- The status shows only catalog membership, not whether YouTube provided a verified title or an allowed playback route.',
 '- Exact work identity / DE rights / video version / YouTube policy must be resolved separately before any productive enrichment.',
 '- If a public URL was unavailable or was an empty placeholder, report not-checked rather than zero membership.',
 ''
 ]
 return{reads,comparison:cmp,report:lines.join('\n')}
}
async function main(){
 const manifest=JSON.parse(await readFile(INPUT,'utf8'))
 const result=await run({manifest,loadPublic:kind=>getPublicJson(kind)})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile(OUTPUT,result.report+'\n',{mode:0o600})
 console.log('G1 PUBLIC MovieHub search='+result.reads.search.status+
  ', browse='+result.reads.browse.status+', 26 provisional work IDs; no writes.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('G1 public 26 audit failed: '+
 String(e?.message||'unknown').slice(0,120));process.exitCode=1})
