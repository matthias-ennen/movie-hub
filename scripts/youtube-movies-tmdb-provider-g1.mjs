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
  // Cross-validate discover results against provider-specific DE detail offers.
  // The discover provider+monetization filter can return combinations absent from
  // the detailed offer response: never treat discover.total_results as confirmed offers.
  const detailsCache=new Map(), checked=[]
  const MAX_COMPARISONS=30
  outer: for(const r of rows) {
    for(const m of r.first) {
      if(checked.length>=MAX_COMPARISONS) break outer
      if(!detailsCache.has(m.id)) {
        if(calls>=CAP) break outer
        const v=await get('/movie/'+m.id+'/watch/providers')
        detailsCache.set(m.id,v.results?.DE||{})
      }
      const de=detailsCache.get(m.id)
      const actual=TYPES.filter(t=>Array.isArray(de[t])&&de[t].some(p=>Number(p.provider_id)===r.p.id))
      const alternatives=(Array.isArray(de[r.offer])?de[r.offer]:[])
        .filter(p=>Number(p.provider_id)!==r.p.id)
        .map(p=>({id:Number(p.provider_id),name:String(p.provider_name||'').replace(/[|\n\r]/g,' ').slice(0,65)}))
        .filter(p=>Number.isInteger(p.id)&&p.id>0)
      const diagnosis=actual.includes(r.offer)?'same-provider'
        : alternatives.length?'other-provider-only':'type-not-in-DE-details'
      checked.push({...m,providerId:r.p.id,discoverType:r.offer,actual,
        alternatives,diagnosis,result:actual.includes(r.offer)?'detail-agrees':'detail-disagrees'})
    }
  }
  const matches=checked.filter(c=>c.result==='detail-agrees').length
  const conflicts=checked.length-matches
  const elsewhere=checked.filter(c=>c.diagnosis==='other-provider-only').length
  const absent=checked.filter(c=>c.diagnosis==='type-not-in-DE-details').length
  const quality=rows.map(r=>{
    const samples=checked.filter(c=>c.providerId===r.p.id && c.discoverType===r.offer)
    return {providerId:r.p.id,offer:r.offer,candidates:r.total,checked:samples.length,
      matches:samples.filter(c=>c.result==='detail-agrees').length,
      conflicts:samples.filter(c=>c.result==='detail-disagrees').length}
  })
  const report=[
    '# YouTube Movies G1 – TMDB DE Anbieter- und Angebotsprüfung','',
    '- Prüfzeit: '+time(),'- TMDB-Anfragen: '+calls+'/'+CAP,
    '- Nur TMDB-Daten; **keine** offiziellen YouTube-Shop-IDs, konkreten Preise oder Geräte-/Playbacktests.',
    '- Keine Änderung von MovieHub-Katalog oder Badges; YouTube- und Google-Provider nicht gleichsetzen.',
    '- Discover-Filterkombinationen sind nur Kandidaten. Detail-Übereinstimmung ist TMDB-interne Evidenz, **keine** reale YouTube-Shop-Validierung.',
    '- Kontrollierte Vergleiche: '+checked.length+' (übereinstimmend '+matches+', abweichend '+conflicts+'), '+detailsCache.size+' einmalig abgerufene Filmdetails.',
    '- Unter den Abweichungen: '+elsewhere+' mit anderem Anbieter im gesuchten Angebotstyp, '+absent+' ohne diesen Angebotstyp in DE-Details.',
    '- **Hypothesentest:** Anderer Anbieter im gesuchten Typ spricht für getrennte Filterbedingungen; beweist aber keine interne TMDB-SQL-Implementierung.',
    '','## TMDB-Anbieterkennungen (Deutschland)','',
    '| ID | Anbieter | Klassifizierung |','| ---: | --- | --- |',
    ...providers.map(p=>'| '+p.id+' | '+p.name+' | '+p.kind+' |'),
    '','## TMDB Discover (total_results ist keine YouTube-Shop-Bestandszahl)','',
    '| Provider | Angebotsart | total_results |','| ---: | --- | ---: |',
    ...rows.map(r=>'| '+r.p.id+' | '+r.offer+' | '+(r.total??'unbekannt')+' |'),
    '','## Kreuzvalidierung Discover gegen DE-Details (nur erstes Suchergebnis je Angebotsfilter)','',
    '| Provider | Discover-Typ | Suchtreffer (Kandidaten) | Kontrolliert | Übereinstimmend | Abweichend |',
    '| ---: | --- | ---: | ---: | ---: | ---: |',
    ...quality.map(q=>'| '+q.providerId+' | '+q.offer+' | '+(q.candidates??'unbekannt')+' | '+q.checked+' | '+q.matches+' | '+q.conflicts+' |'),
    '','## TMDB-Detail-Gegenproben (max. zwei Discover-Beispiele pro Anbieter/Typ)','',
    '| TMDB-ID | Titel | Provider-ID | Discover-Typ | Detailangebote beim Anbieter | Vergleich | Alternativ-Anbieter (selbe Angebotsart) | Diagnose |',
    '| ---: | --- | ---: | --- | --- | --- | --- | --- |',
    ...checked.map(c=>'| '+c.id+' | '+c.title+' | '+c.providerId+' | '+c.discoverType+' | '+(c.actual.join(', ')||'keine')+' | '+c.result+' | '+(c.alternatives.map(p=>p.name+' ('+p.id+')').slice(0,3).join(', ')||'—')+' | '+c.diagnosis+' |'),
    '','## Offene Gates','',
    '- Abdeckung des YouTube-eigenen Filmshops, tatsächliche Preise und exakte YouTube-App-Deep-Links nicht belegt.',
    '- Separates 40–60-Fälle-Shop-Sample, manuelle Android-/Fire-TV-Linktests, Lizenz-/Attributionsprüfung.',
    '- Kein produktiver Adapter, kein Scraping, keine G2-Freigabe.',''
  ].join('\n')
  return {report,calls,providers,rows,checked,quality,matches,conflicts,elsewhere,absent}
}
if(process.argv[1]?.endsWith('youtube-movies-tmdb-provider-g1.mjs')) {
  try {
    const r=await audit({token:process.env.TMDB_API_READ_TOKEN})
    await mkdir('artifacts/youtube-movies-g1',{recursive:true})
    await writeFile('artifacts/youtube-movies-g1/provider-audit.md',r.report,{mode:0o600})
    console.log('G1 read-only complete: '+r.providers.length+' providers, '+r.rows.length+' classes, '+r.checked.length+' provider/offer comparisons ('+r.matches+' agree, '+r.conflicts+' disagree); '+r.calls+' calls.')
  } catch(e) { console.error('TMDB G1 error: '+String(e.message).slice(0,180)); process.exitCode=1 }
}
