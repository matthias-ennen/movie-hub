// G1 only: generate a reproducible HUMAN review queue and bounded hints for search misses.
// A TMDB search result is never converted here into a canonical movie or provider offer.
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { safeTitle, isVideoId } from './youtube-api-smoke.mjs'

export const MAX_MANUAL_QUEUE = 18
export const MAX_UNMATCHED_PROBE = 20
export const MAX_VARIANTS_PER_TITLE = 2

function safeId(id) { return isVideoId(id) ? id : null }
function year(x) { const n = Number(x); return Number.isInteger(n) && n >= 1888 && n <= 2100 ? n : null }
function minutes(x) { const n = Number(x); return Number.isFinite(n) && n >= 0 ? n : null }

export function chooseDiverseManualQueue(prioritized, limit = MAX_MANUAL_QUEUE) {
  const buckets = new Map()
  const valid = (prioritized || []).filter(v=>safeId(v.videoId) && Number.isInteger(Number(v.tmdbId)) && Number(v.tmdbId)>0)
  for (const v of valid) {
    const delta = minutes(v.runtimeDelta)
    const band = delta === null ? 'unknown' : delta <= 1 ? 'near' : delta <= 5 ? 'middle' : 'edge'
    const decade = Math.floor(Number(v.tmdbYear) / 10) * 10 || 0
    const key = band + ':' + decade
    if(!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(v)
  }
  for (const values of buckets.values()) values.sort((a,b)=>
    a.videoId.localeCompare(b.videoId))
  // Alternate runtime bands and film decades; avoid only the newest or cleanest examples.
  const keys = [...buckets.keys()].sort((a,b)=>{
    const weight = k => k.startsWith('edge')?0:k.startsWith('near')?1:k.startsWith('middle')?2:3
    return weight(a)-weight(b) || a.localeCompare(b)
  })
  const selected=[]
  const seen=new Set()
  while(selected.length < Math.min(limit, valid.length)){
    let progressed=false
    for (const key of keys) {
      const v=buckets.get(key).shift()
      if(!v)continue
      progressed=true
      if(seen.has(v.videoId))continue
      seen.add(v.videoId)
      selected.push({...v, stratum:key})
      if(selected.length >= limit)break
    }
    if(!progressed)break
  }
  return selected
}

export function boundedUnmatchedSample(decisions, limit = MAX_UNMATCHED_PROBE) {
  const misses = (decisions||[]).filter(x=>x.status==='unmatched' && safeId(x.videoId))
  const byPublisher=new Map()
  for(const c of misses){
    const key=String(c.publisher||'unknown')
    if(!byPublisher.has(key))byPublisher.set(key,[])
    byPublisher.get(key).push(c)
  }
  const groups=[...byPublisher.entries()].sort(([a],[b])=>a.localeCompare(b))
  if(!groups.length || limit<=0)return []
  const selected=[]
  const taken=new Set()
  // One sample per publisher per round first, then distribute evenly in playlist order.
  for(const [,group] of groups)group.sort((a,b)=>a.videoId.localeCompare(b.videoId))
  let progressed=true
  while(selected.length<Math.min(limit,misses.length) && progressed){
    progressed=false
    for (const [,group] of groups){
      if(!group.length)continue
      const item=group.shift()
      progressed=true
      if(taken.has(item.videoId))continue
      selected.push(item)
      taken.add(item.videoId)
      if(selected.length>=limit)break
    }
  }
  return selected
}

function normalizeSearchText(value) {
  return String(value||'').replace(/\s+/g,' ').trim()
}
export function conservativeTitleVariants(rawTitle, parsedTitle) {
  const raw=normalizeSearchText(rawTitle)
  const parsed=normalizeSearchText(parsedTitle)
  const suggestions = []
  const promote = v => {
    const t=normalizeSearchText(v)
      .replace(/^[\s'"«»]+|[\s'"«»]+$/g,'')
      .replace(/\s+[-–|:]\s*(?:ganzer film(?: auf deutsch)?|full movie|kompletter film|deutsch(?:e fassung)?|hd(?: 1080p)?)\b.*$/i,'')
      .trim()
    if(/^(?:ganzer film|full movie|kompletter film|hd 1080p|netzkino)(?:\s|$)/i.test(t)) return
    if(t.length>=4 && t.length<=110 && normalizeWaipuText(t)!==normalizeWaipuText(parsed) &&
       !suggestions.some(x=>normalizeWaipuText(x)===normalizeWaipuText(t))) suggestions.push(t)
  }
  // Only explicit promo prefixes/suffixes, quotes, or pipe-delimited segments.
  promote(parsed.replace(/^(?:ganzer film(?: auf deutsch)?|full movie|netzkino)\s*[:|–-]\s*/i,''))
  promote(raw.replace(/^(?:ganzer film(?: auf deutsch)?|full movie|netzkino)\s*[:|–-]\s*/i,'')
    .replace(/\s*\((?:19|20)\d{2}\)\s*/g,' '));
  for(const segment of raw.split(/\s+\|\s+/))promote(segment)
  // Deliberately do not split generic hyphenated titles or guess movie years.
  return suggestions.slice(0,MAX_VARIANTS_PER_TITLE)
}

export async function buildReviewDiagnostics({prioritized, decisions, detailMap},
  {searchTmdb, manualLimit=MAX_MANUAL_QUEUE, unmatchedLimit=MAX_UNMATCHED_PROBE}={}) {
  if(typeof searchTmdb!=='function')throw new TypeError('TMDB query callback required')
  const manual=chooseDiverseManualQueue(prioritized,manualLimit)
  const misses=boundedUnmatchedSample(decisions,unmatchedLimit)
  const reasonCounts={}
  const problems=[]
  let actualSearchCalls=0
  for(const d of misses){
    const video=detailMap.get(d.videoId)
    const variants=conservativeTitleVariants(video?.snippet?.title,d.title)
    const candidates=[]
    for(const q of variants){
      actualSearchCalls++
      // The existing TMDB search client supplies the same rules/cache/throttling.
      const results=await searchTmdb({type:'movie',title:q})
      if(!Array.isArray(results))throw new Error('TMDB diagnostic query returned invalid result')
      for(const candidate of results.slice(0,8)){
        const id=Number(candidate.id??candidate.tmdbId)
        if(!Number.isInteger(id)||id<=0)continue
        candidates.push({id,title:String(candidate.title||''),year:year(String(candidate.release_date||'').slice(0,4))})
      }
    }
    const dedup=[...new Map(candidates.map(c=>[c.id,c])).values()]
    const status=!variants.length?'no-safe-query-variant':!dedup.length?'no-search-results':'candidate-hints-only'
    reasonCounts[status]=(reasonCounts[status]||0)+1
    problems.push({videoId:d.videoId,oldTitle:d.title,rawTitle:video?.snippet?.title||'',
      publisher:d.publisher,variants,status,candidates:dedup.slice(0,3)})
  }
  const lines=[
    '## G1 – manuelle Qualitätsprüfliste und getrennte TMDB-Suchfehlerdiagnose','',
    '- **Keine echte menschliche Video- oder Rechteprüfung durchgeführt**: folgende Fälle sind erst eine reproduzierbare Arbeitsliste.',
    '- Die 79 priorisierten Videos bleiben **review**; selbst positive Suchhinweise ändern keinerlei kanonische Identität.',
    '- Die Liste wurde aus demselben temporären YouTube-Sample in unterschiedlichen Jahres-/Laufzeitgruppen gewählt.',
    '- Die 47 bisherigen `unmatched` bleiben `unmatched`; höchstens '+unmatchedLimit+' erhalten eine eng begrenzte alternative TMDB-Titelsuche.',
    '- YouTube-Uploaddatum zählt niemals als Filmjahr; weder Freigabe noch DE-/Fire-TV-Playback wurden geprüft.',
    '',
    '### A. Manuelle Sichtprüfung – Arbeitsliste','',
    '| YouTube-Video | TMDB-Kandidat | TMDB-Jahr | Laufzeitdiff. | Sichtprüfung / Rechte |',
    '| --- | --- | ---: | ---: | --- |',
  ]
  for(const c of manual){
    lines.push('| ['+safeTitle(c.title)+'](https://www.youtube.com/watch?v='+c.videoId+
      ') | [TMDB '+c.tmdbId+'](https://www.themoviedb.org/movie/'+c.tmdbId+
      ') | '+(year(c.tmdbYear)??'?')+' | '+(minutes(c.runtimeDelta)??'?')+
      ' min | **offen** |')
  }
  if(!manual.length)lines.push('| keine Fälle | – | – | – | – |')
  lines.push('','Prüfkriterien pro Video: **gleiches Werk/TMDB-ID**, vollständiger Film oder andere Fassung, tatsächliche deutsche Wiedergabe (Browser und Fire TV), Kosten/Anmeldung/Werbung und **Quellen-/Verbreitungsrechte**. Die Arbeitsliste ist keine dokumentierte Abnahme.','',
    '### B. Fehlende TMDB-Kandidaten – alternative Suchbegriffe (Diagnose)','',
    '| Video | Ursprünglicher Titel | Sichere alternative Begriffe | TMDB-Suchhinweise |',
    '| --- | --- | --- | --- |')
  for(const item of problems){
    const hints=item.candidates.map(v=>'TMDB '+v.id+(v.year?' ('+v.year+')':'')).join(', ')
    lines.push('| [Video](https://www.youtube.com/watch?v='+item.videoId+') | '+
      safeTitle(item.oldTitle)+' | '+(item.variants.map(safeTitle).join('; ')||'keine')+
      ' | '+(hints||item.status)+' |')
  }
  if(!problems.length)lines.push('| keine Fälle | – | – | – |')
  lines.push('','### Messgrenzen','',
    '- Manuelle Prüfplätze: **'+manual.length+'** aus den '+prioritized.length+' priorisierten Reviewfällen.',
    '- Unmatched-Diagnose: **'+problems.length+'** Stichprobenfälle aus '+decisions.filter(x=>x.status==='unmatched').length+' ohne Kandidat.',
    '- Tatsächlich zusätzlich vom Diagnoseskript ausgeführte TMDB-Suchaufrufe (vor internem Cache/Retry): **'+actualSearchCalls+'**; max. '+unmatchedLimit*MAX_VARIANTS_PER_TITLE+'.',
    '- Diagnostischer Status: '+Object.entries(reasonCounts).map(([k,v])=>k+'='+v).join(', ')+'.',
    '- **Suchhinweise sind keine Treffernachweise**; echte Filmidentität, Rechtslage und Verfügbarkeit weiterhin offen.',
    '- Keine Änderung an Waipu-/Joyn-Matcher, MovieHub-Katalog, Provider-Badges, Firestore oder Firebase.',
    '')
  return {report:lines.join('\n'),manual,problems,reasonCounts,actualSearchCalls,totalUnmatched:decisions.filter(x=>x.status==='unmatched').length}
}
