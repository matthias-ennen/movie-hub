// Research-only G1: probe discoverability of official YouTube Movies film IDs via public Data API.
// No MovieHub catalog, badges, provider offers, or platform data are modified.
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet, isVideoId, safeTitle, getRegionSignal } from './youtube-api-smoke.mjs'

export const FILMS = Object.freeze([
  { tmdb: 392011, title: 'Kedi: Von Katzen und Menschen', query: 'Kedi Von Katzen und Menschen 2016', knownId: '-oMYcSU3oVo' },
  { tmdb: 9479, title: 'Nightmare Before Christmas', query: 'Nightmare Before Christmas 1993 Film', knownId: 'Hw0CGCHl3V8' },
  { tmdb: 238, title: 'Der Pate', query: 'Der Pate 1972 Film', knownId: null },
  { tmdb: 872585, title: 'Oppenheimer', query: 'Oppenheimer 2023 Film', knownId: null },
])
export const MAX_SEARCH_REQUESTS=8
export const MAX_API_REQUESTS=9

export async function analyze({ api, at=()=>new Date().toISOString() }={}) {
  if (typeof api!=='function') throw new Error('Read-only API function required')
  let calls=0, searchCalls=0
  async function limited(endpoint,params) {
    if(calls>=MAX_API_REQUESTS) throw Error('Hard request cap reached')
    if(endpoint==='search'&&searchCalls>=MAX_SEARCH_REQUESTS) throw Error('Search cap reached')
    calls++
    if(endpoint==='search') searchCalls++
    return api(endpoint,params)
  }
  const known=FILMS.map(f=>f.knownId).filter(isVideoId)
  const outcomes=[]
  for(const film of FILMS) {
    const variants=[]
    for(const videoType of ['movie','any']) {
      let result
      try {
        const payload=await limited('search',{
          part:'snippet',type:'video',videoType,regionCode:'DE',
          relevanceLanguage:'de',q:film.query,maxResults:10
        })
        const videos=payload.items.filter(x=>isVideoId(x.id?.videoId)).map(x=>({
          id:x.id.videoId,
          title:safeTitle(x.snippet?.title),
          channel:safeTitle(x.snippet?.channelTitle)
        }))
        result={videoType,totalReturned:videos.length,foundKnown:film.knownId ? videos.some(x=>x.id===film.knownId) : null,
          first:videos.slice(0,3),state:'ok'}
      } catch(err) {
        result={videoType,state:'api-error',message:String(err?.message||'Unknown API error').replace(/https?:\/\/\S+/g,'[URL]').slice(0,140)}
      }
      variants.push(result)
    }
    outcomes.push({tmdb:film.tmdb,title:film.title,knownId:film.knownId||null,variants})
  }
  // Use the ONE existing videos.list call after search; include known and first
  // three movie-filter candidates per title. No additional YouTube API calls.
  const candidateIds=[...new Set(outcomes.flatMap(o=>(o.variants[0]?.first||[]).map(x=>x.id)).filter(isVideoId))]
  const detailIds=[...new Set([...known,...candidateIds])].slice(0,50)
  const details=await limited('videos',{part:'snippet,contentDetails,status',id:detailIds.join(',')})
  const detailById=new Map(details.items.filter(x=>isVideoId(x.id)).map(x=>[x.id,x]))
  const knownChannels=new Set(known.map(id=>detailById.get(id))
    .filter(x=>x?.snippet?.channelId && /^YouTube Movies(?: & TV)?$/.test(x.snippet.channelTitle||''))
    .map(x=>x.snippet.channelId))
  const metadata=(v)=>v?{
    title:safeTitle(v.snippet?.title),channel:safeTitle(v.snippet?.channelTitle),
    channelId:String(v.snippet?.channelId||'').slice(0,80),
    deSignal:getRegionSignal(v.contentDetails?.regionRestriction),
    deExcluded:Array.isArray(v.contentDetails?.regionRestriction?.allowed)
      ?!v.contentDetails.regionRestriction.allowed.includes('DE')
      :Boolean(v.contentDetails?.regionRestriction?.blocked?.includes('DE')),
    duration:String(v.contentDetails?.duration||'unbekannt').slice(0,32),
    runtimeMinutes:runtimeMinutes(v.contentDetails?.duration),
    visibility:String(v.status?.privacyStatus||'unbekannt').slice(0,24)
  }:null
  const candidateDetails=outcomes.flatMap(o=>(o.variants[0]?.first||[]).map(hit=>{
    const detail=metadata(detailById.get(hit.id))
    return {tmdb:o.tmdb,film:o.title,id:hit.id,detail,
      knownChannel:detail?.channelId?knownChannels.has(detail.channelId):null,
      filmLength:detail?.runtimeMinutes===null?null:detail.runtimeMinutes>=60}
  }))
  for(const o of outcomes) {
    const detail=o.knownId?metadata(detailById.get(o.knownId)):null
    o.knownIdResolved=o.knownId?Boolean(detail):null
    o.detail=detail
  }
  const lines=[
    '# YouTube Movies G1 – Film-ID Discoverability (DE, Data API)',
    '',
    '- Zeit: '+at(),
    '- Rein lesende YouTube Data API; Suchaufrufe: '+searchCalls+'/'+MAX_SEARCH_REQUESTS+', alle Anfragen: '+calls+'/'+MAX_API_REQUESTS,
    '- Das Suchsample umfasst vier bekannte TMDB-Filme; nur zwei Film-IDs sind aus öffentlichen YouTube-Movies-Webfundstellen bekannt.',
    '- VIDEO-Fundstellen und Datensätze sind **keine** Bestätigung für offizielle DE-Shop-Preise, Free/ADS/Rent/Buy, Entitlement oder Fire-TV-App-Playback.',
    '- Keine API-Preisfelder erwartet; videoType=movie darf NICHT als rechts- oder preisverifizierter Filmladen interpretiert werden.',
    '',
    '| Film (TMDB-ID) | Bekannte ID | videos.list ID vorhanden | movie-Suche: Treffer-ID? | any-Suche: Treffer-ID? |',
    '| --- | --- | --- | --- | --- |',
    ...outcomes.map(o=>'| '+safeTitle(o.title)+' ('+o.tmdb+') | '+(o.knownId||'unbekannt')+' | '+
      (o.knownIdResolved===null?'nicht prüfbar':o.knownIdResolved?'ja':'nein')+' | '+
      status(o.variants[0])+' | '+status(o.variants[1])+' |'),
    '',
    '## Details zu bekannten Film-IDs aus videos.list (keine DE-Shop-Freigabe)','',
    ...outcomes.filter(o=>o.knownId).flatMap(o=>[
      '- '+safeTitle(o.title)+' ['+o.tmdb+']: '+(o.detail
        ? ('API-Titel „'+o.detail.title+'“, Kanal „'+o.detail.channel+'“, DE-Signal: '+o.detail.deSignal+', Sichtbarkeit: '+o.detail.visibility+', Laufzeit: '+o.detail.duration)
        : 'ID im öffentlichen Data-API-Abruf **nicht** auflösbar (kein Beweis, dass der Film im YouTube-Shop nicht existiert)')]),
    '',
    '## Suchbeispiele (Kandidaten, niemals automatisch zu MovieHub zuordnen)',''
  ]
  for(const o of outcomes)for(const v of o.variants) {
    lines.push('### '+safeTitle(o.title)+' / videoType='+v.videoType,'')
    if(v.state!=='ok')lines.push('- API-Fehler: '+(v.message||'unbekannt'),'')
    else {
      lines.push('- Treffer auf dieser einzigen Suchseite: '+v.totalReturned,
        '- Bekannte ID unter den bis zu zehn Suchtreffern: '+(v.foundKnown===null?'kein bekannter Vergleichswert':v.foundKnown?'ja':'nein'),'')
      lines.push('| ID | Titel | Kanal |','| --- | --- | --- |',
        ...v.first.map(x=>'| '+x.id+' | '+x.title+' | '+x.channel+' |'),'')
    }
  }
  lines.push('## Interpretation und weitere G1-Gates','',
    '- **Fehlender Suchtreffer beweist keine fehlende Storefront:** Google weist darauf hin, dass Titel außerhalb ihres Angebotsfensters unter Umständen nicht per Titelsuche auffindbar sind.',
    '- **Gefundene ID allein genügt nicht für TMDB-Match:** Regie, Jahr/Fassung, offizieller Filmmodus und Anbieter/Entitlement sind unabhängig zu prüfen.',
    '- **Preis-/Kauf-/Leihangebot nicht aus search.list, videos.list, licensedContent, regionRestriction oder paidProductPlacement ableiten.**',
    '- **Keine** Anmeldung an ein fremdes Partnerportal, kein Scraping, keine Käufe, keine Geräteabnahme und keine Veröffentlichung in MovieHub.',
    '- Nächster G1-Gate: tatsächliche offizielle YouTube-Movies-UI (DE, ggf. eingeloggtes Testkonto) und mobiler bzw. Fire-TV-Linktest mit expliziter Nutzerabnahme.',
    '')
  return {calls,searchCalls,outcomes,report:lines.join('\n')}
}
function status(v) {
  if(v.state!=='ok')return 'API-Fehler'
  return v.foundKnown===null?'keine bekannte ID':v.foundKnown?'ja':'nein (erste 10)'
}

async function main() {
  const key=getSecret()
  const result=await analyze({api:(endpoint,params)=>youtubeGet(endpoint,params,key)})
  await mkdir('artifacts/youtube-movies-g1',{recursive:true})
  await writeFile('artifacts/youtube-movies-g1/id-discoverability.md',result.report+'\n',{mode:0o600})
  console.log('YouTube Movies ID G1 completed: '+result.calls+' requests, '+result.searchCalls+' search.list; sample '+result.outcomes.length+' films. Research artifact only.')
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(e=>{console.error('YouTube Movies ID G1 failed: '+String(e.message).slice(0,160));process.exitCode=1})
}
