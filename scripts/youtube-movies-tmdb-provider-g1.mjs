// G1 read-only research: never write MovieHub catalog, offers, or provider state.
import { mkdir, writeFile } from 'node:fs/promises'
const TYPES=['free','ads','rent','buy','flatrate'], REGION='DE', CAP=48
export function classify(name) {
  const n=String(name||'').trim().toLowerCase()
  if (/^youtube(?:\s|$)/.test(n)) return 'youtube-family'
  if (/^google play movies(?:\s|$)/.test(n)) return 'google-play-movies'
  if (/^google tv(?:\s|$)/.test(n)) return 'google-tv'
  return null
}
export async function audit({token,request=fetch,time=()=>new Date().toISOString()}={}) {
  if (!token) throw Error('TMDB_API_READ_TOKEN secret is required')
  let calls=0
  async function get(path, params={}) {
    if (++calls>CAP) throw Error('Read-only TMDB request cap reached')
    const url=new URL('https://api.themoviedb.org/3'+path)
    for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v))
    let res
    try {res=await request(url,{headers:{Accept:'application/json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)})}
    catch {throw Error('TMDB network failure at '+path)}
    if (!res.ok) throw Error('TMDB HTTP '+res.status+' at '+path)
    return res.json()
  }
  const dir=await get('/watch/providers/movie',{watch_region:REGION,language:'de-DE'})
  const providers=(Array.isArray(dir.results)?dir.results:[]).filter(p=>classify(p.provider_name))
    .map(p=>({id:Number(p.provider_id),name:String(p.provider_name).replace(/[|\n\r]/g,' '),kind:classify(p.provider_name)}))
    .filter(p=>Number.isInteger(p.id)&&p.id>0).sort((a,b)=>a.name.localeCompare(b.name,'de'))
  const rows=[]
  for(const p of providers.slice(0,6)) for(const offer of TYPES) {
    const v=await get('/discover/movie',{watch_region:REGION,with_watch_providers:p.id,with_watch_monetization_types:offer,language:'de-DE',include_adult:'false',page:1})
    const first=(Array.isArray(v.results)?v.results:[]).slice(0,2)
      .map(m=>({id:Number(m.id),title:String(m.title||'').replace(/[|\n\r]/g,' ')}))
      .filter(m=>Number.isInteger(m.id)&&m.id>0)
    rows.push({p,offer,total:Number.isInteger(v.total_results)?v.total_results:null,first})
  }
  const seen=new Set(), checked=[]
  for(const r of rows) {
    if(checked.length>=12) break
    const m=r.first.find(m=>!seen.has(m.id))
    if(!m) continue
    seen.add(m.id)
    const v=await get('/movie/'+m.id+'/watch/providers')
    const de=v.results?.DE||{}
    const actual=TYPES.filter(t=>Array.isArray(de[t])&&de[t].some(p=>Number(p.provider_id)===r.p.id))
    checked.push({...m,providerId:r.p.id,discoverType:r.offer,actual})
  }
  const report=[
    '# YouTube Movies G1 – TMDB DE Anbieter- und Angebotsprüfung','',
    '- Prüfzeit: '+time(),'- TMDB-Anfragen: '+calls+'/'+CAP,
    '- Nur TMDB-Daten; **keine** offiziellen YouTube-Shop-IDs, konkreten Preise oder Geräte-/Playbacktests.',
    '- Keine Änderung von MovieHub-Katalog oder Badges; YouTube- und Google-Provider nicht gleichsetzen.',
    '','## TMDB-Anbieterkennungen (Deutschland)','',
    '| ID | Anbieter | Klassifizierung |','| ---: | --- | --- |',
    ...providers.map(p=>'| '+p.id+' | '+p.name+' | '+p.kind+' |'),
    '','## TMDB Discover (total_results ist keine YouTube-Shop-Bestandszahl)','',
    '| Provider | Angebotsart | total_results |','| ---: | --- | ---: |',
    ...rows.map(r=>'| '+r.p.id+' | '+r.offer+' | '+(r.total??'unbekannt')+' |'),
    '','## TMDB-Detail-Gegenproben','',
    '| TMDB-Film-ID | Titel | Provider-ID | Discover | Detail-Angebote DE |',
    '| ---: | --- | ---: | --- | --- |',
    ...checked.map(c=>'| '+c.id+' | '+c.title+' | '+c.providerId+' | '+c.discoverType+' | '+(c.actual.join(', ')||'keine')+' |'),
    '','## Offene Gates','',
    '- Abdeckung des YouTube-eigenen Filmshops, tatsächliche Preise und exakte YouTube-App-Deep-Links nicht belegt.',
    '- Separates 40–60-Fälle-Shop-Sample, manuelle Android-/Fire-TV-Linktests, Lizenz-/Attributionsprüfung.',
    '- Kein produktiver Adapter, kein Scraping, keine G2-Freigabe.',''
  ].join('\n')
  return {report,calls,providers,rows,checked}
}
if(process.argv[1]?.endsWith('youtube-movies-tmdb-provider-g1.mjs')) {
  try {
    const r=await audit({token:process.env.TMDB_API_READ_TOKEN})
    await mkdir('artifacts/youtube-movies-g1',{recursive:true})
    await writeFile('artifacts/youtube-movies-g1/provider-audit.md',r.report,{mode:0o600})
    console.log('G1 read-only complete: '+r.providers.length+' providers, '+r.rows.length+' classes, '+r.checked.length+' film details; '+r.calls+' calls.')
  } catch(e) { console.error('TMDB G1 error: '+String(e.message).slice(0,180)); process.exitCode=1 }
}
