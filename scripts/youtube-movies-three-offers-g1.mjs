// G1 research only: exact German TMDB watch-provider offers for three tested YouTube movie URLs.
// No writes to MovieHub, no prices or shop claims.
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

export const CASES=Object.freeze([
  {tmdb:9479,title:'Nightmare Before Christmas',videoId:'nJf67zNZhoc'},
  {tmdb:238,title:'Der Pate',videoId:'xcCsnx-GRkA'},
  {tmdb:872585,title:'Oppenheimer',videoId:'_1WjM7ucekc'}
])
export const TYPES=Object.freeze(['flatrate','free','ads','rent','buy'])
export const LIMIT=4
function safe(v){return String(v??'').replace(/[\r\n|<>[\]\\*]/g,' ').replace(/\s+/g,' ').slice(0,90)}
export function classify(v){
 const n=String(v||'').trim().toLowerCase()
 if(n==='youtube'||n==='youtube free'||n==='youtube premium')return 'youtube-family'
 if(n==='google play movies')return 'google-play-movies'
 if(n==='google tv')return 'google-tv'
 return null
}
export function evaluate(film,directory,detail){
 const de=detail?.results?.DE
 const hasDe=!!de&&typeof de==='object'&&!Array.isArray(de)
 const categories=Object.fromEntries(TYPES.map(type=>[type,hasDe&&Array.isArray(de[type])?de[type]:[]]))
 const offerings=directory.map(p=>({...p,
   offerTypes:hasDe?TYPES.filter(type=>categories[type].some(x=>Number(x?.provider_id)===p.id)):[],
   sourceStatus:hasDe?'tmdb-de-detail':'de-detail-missing'
 }))
 const competitors=TYPES.map(type=>({
   type,otherProviders:categories[type]
     .filter(x=>!directory.some(p=>p.id===Number(x?.provider_id)))
     .slice(0,3).map(x=>safe(x.provider_name))
 })).filter(x=>x.otherProviders.length)
 return {...film,hasDe,offerings,competitors}
}
export async function audit({token,request=fetch,at=()=>new Date().toISOString()}={}){
 if(typeof token!=='string'||token.length<15)throw Error('TMDB_API_READ_TOKEN missing')
 let calls=0
 async function get(path,query={}){
  if(calls>=LIMIT)throw Error('G1 hard cap exceeded')
  calls++
  const url=new URL('https://api.themoviedb.org/3'+path)
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value))
  let response
  try{response=await request(url,{
    headers:{Accept:'application/json',Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(12000)
  })}catch{throw Error('TMDB network/timeout at '+path)}
  if(!response?.ok)throw Error('TMDB HTTP '+(response?.status||'unknown')+' at '+path)
  try{return await response.json()}catch{throw Error('TMDB invalid JSON at '+path)}
 }
 const directoryData=await get('/watch/providers/movie',{watch_region:'DE',language:'de-DE'})
 const directory=(Array.isArray(directoryData.results)?directoryData.results:[])
   .map(x=>({id:Number(x.provider_id),name:safe(x.provider_name),family:classify(x.provider_name)}))
   .filter(x=>Number.isInteger(x.id)&&x.id>0&&x.family)
   .sort((a,b)=>a.id-b.id)
 const rows=[]
 for(const film of CASES){
   const details=await get('/movie/'+film.tmdb+'/watch/providers')
   rows.push(evaluate(film,directory,details))
 }
 const lines=[
  '# YouTube Movies G1 - drei Film-TMDB-Detailangebote DE','',
  '- Zeitpunkt: '+at(),
  '- Lesende TMDB-Anfragen: '+calls+'/'+LIMIT+'; genau drei festgelegte Filmwerke.',
  '- Die drei Film-Links wurden auf Android und Fire TV durch den Nutzer positiv getestet.',
  '- Diese Daten belegen ausschliesslich die bei TMDB/JustWatch hinterlegten Angebote je DE-Anbieter.',
  '- Niemals aus TMDB-Details einen aktuellen YouTube-Shoppreis, Konto-Zugang oder vertragliche Rechte erfinden.',
  '- YouTube, YouTube Free, YouTube Premium und Google-TV-Angebote bleiben unterschiedliche Provider-IDs.',
  '- Anbieter ohne TMDB-Detailtreffer bedeutet NICHT nachgewiesene Nichtverfuegbarkeit im YouTube-Shop.',
  '- TMDB Watch-Provider-Angaben erfordern eine JustWatch-Attribution, die bereits im MovieHub AboutView genannt wird.',
  '',
  '## Erfasste Provider',
  '',
  '| Anbieter-ID | Name | Gruppe |','| ---: | --- | --- |',
  ...directory.map(x=>'| '+x.id+' | '+x.name+' | '+x.family+' |'),
  '',
  '## Provider- und Angebotsarten aus DE-Filmdetails',
  '',
  '| Film / TMDB | YouTube-Film-ID | DE-Details | TMDB-Provider | TMDB-OfferTypes |',
  '| --- | --- | --- | --- | --- |',
  ...rows.flatMap(r=>r.offerings.length?r.offerings.map(p=>
    '| '+safe(r.title)+' ('+r.tmdb+') | '+r.videoId+' | '+(r.hasDe?'ja':'fehlt')+
    ' | '+p.name+' ('+p.id+') | '+(r.hasDe?(p.offerTypes.join(', ')||'kein TMDB-Treffer'):'unknown')+' |')
   :['| '+safe(r.title)+' ('+r.tmdb+') | '+r.videoId+' | '+(r.hasDe?'ja':'fehlt')+' | Keine passenden Anbieter in DE-Directory | unknown |']),
  '',
  '## Andere Anbieter - nicht auf YouTube umdeuten','',
  '| Film-TMDB | OfferType | Beispiel andere Anbieter |',
  '| ---: | --- | --- |',
  ...rows.flatMap(r=>r.competitors.map(v=>'| '+r.tmdb+' | '+v.type+' | '+v.otherProviders.join(', ')+' |')),
  '',
  '## Grenze und naechste Nutzerpruefung','',
  ...rows.map(r=>'- '+safe(r.title)+': TMDB-DE-Filmdetails '+(r.hasDe?'ja':'nein')+
    '; YouTube-Familie: '+(r.offerings.filter(p=>p.family==='youtube-family'&&p.offerTypes.length)
      .map(p=>p.name+'='+p.offerTypes.join('/')).join(', ')||'kein belegter TMDB-DE-Angebotstreffer')+
    '; echte DE-YouTube-Shop-Buttons, Preis und Entitlement UNBEKANNT.'),
  '- Vor Freigabe einsehbare YouTube-DE-Kauf-, Leih-, Gratis-, Werbung- und Abo-Buttons unabhaengig am Geraet pruefen.',
  '- Keine produktive Badge-, Provider-Katalog-, Firebase- oder Firestore-Aenderung. G1 offen, G2-G4 gesperrt.',
  ''
 ]
 return {calls,directory,rows,report:lines.join('\n')}
}
async function main(){
 const r=await audit({token:process.env.TMDB_API_READ_TOKEN})
 await mkdir('artifacts/youtube-movies-g1',{recursive:true})
 await writeFile('artifacts/youtube-movies-g1/three-tmdb-offers.md',r.report+'\n',{mode:0o600})
 console.log('G1 DE three-film TMDB detail report: '+r.calls+' read-only calls, '+r.rows.length+' films. No publishing.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error('G1 TMDB three-film check failed: '+safe(e.message));process.exitCode=1})
}
