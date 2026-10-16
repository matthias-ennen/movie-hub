// G1-only, read-only candidate retrieval diagnostics based on Kodi design ideas.
// Uses existing MovieHub TMDB scoring; neither a match nor a playback/right grant.
import { chooseWaipuTmdbMatch, normalizeTmdbMatchCandidate } from './waipu-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'
import { durationSeconds, runtimeAgreement } from './youtube-api-inventory-pilot.mjs'
import { safeTitle, isVideoId } from './youtube-api-smoke.mjs'

export const HINT_REVIEW_CAP = 6
export const LANGUAGE_PROBE_CAP = 14

const safe = value => safeTitle(String(value || '')).replace(/\s+/g, ' ').slice(0, 85)
const filmYear = value => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1888 && n <= 2100 ? n : null
}
const tmdbId = raw => {
  const n = Number(raw?.tmdbId ?? raw?.id)
  return Number.isInteger(n) && n > 0 ? n : null
}
function uniqueResults(results) {
  return [...new Map((results || []).filter(x=>tmdbId(x))
    .map(x=>[tmdbId(x), { ...x, type:'movie' }])).values()]
}
function titleAliasMatch(title, candidate) {
  const needle = normalizeWaipuText(title)
  return Boolean(needle) && [candidate?.title, candidate?.original_title, candidate?.originalTitle]
    .some(x=>normalizeWaipuText(x)===needle)
}

export async function reviewSixSearchHints({ rows, detailMap }, { searchTmdb, loadDetails, cap = HINT_REVIEW_CAP } = {}) {
  if(typeof searchTmdb!=='function' || typeof loadDetails!=='function') throw new TypeError('TMDB collaborators required')
  const selected = (rows||[]).filter(x=>x.hints?.length && isVideoId(x.videoId)).slice(0,Math.min(HINT_REVIEW_CAP,cap))
  const outcomes=[]
  const detailCache=new Map()
  let detailCalls=0
  for(const row of selected) {
    const video=detailMap.get(row.videoId)
    const alternatives=(row.alternatives||[]).slice(0,2)
    const found=[]
    for(const q of alternatives) {
      const query=String(q?.title||'').trim()
      if(!query)continue
      const results=await searchTmdb({type:'movie',title:query})
      if(!Array.isArray(results))throw new Error('Invalid TMDB hint replay response')
      found.push(...results.slice(0,20))
    }
    const candidates=uniqueResults(found)
    const names=alternatives.map(x=>x.title).filter(Boolean)
    if(!candidates.length || !names.length) {
      outcomes.push({videoId:row.videoId,status:'no-replay-candidates',candidateCount:0,sourceTitle:row.sourceTitle||'',hintIds:row.hints.map(x=>x.tmdbId)})
      continue
    }
    // Do not use upload date as productionYear. Evaluate all competing candidates.
    const evaluation=chooseWaipuTmdbMatch({type:'movie',title:names[0]},candidates)
    const best=evaluation.best?.candidate
    const bestId=best?.tmdbId||null
    const second=evaluation.runnerUp?.candidate||null
    const outcome={videoId:row.videoId,sourceTitle:row.sourceTitle||'',
      searchTitle:names[0],status:'manual-review',reason:null,
      bestId, bestTitle:best?.title||'', bestYear:filmYear(best?.year),
      candidateCount:candidates.length, runnerUpId:second?.tmdbId||null,
      score:evaluation.best?.score??null, margin:evaluation.margin,
      runtimeDelta:null,
      topIds:candidates.map(x=>tmdbId(x)).filter(Boolean).slice(0,6)}
    // Without an independent YouTube film year the shared production matcher
    // intentionally scores exact-title matches below the production threshold.
    // We still may *prioritize HUMAN review* (score>=70, margin>=12), never promote identity.
    if(!best || evaluation.best.score<70 || (evaluation.runnerUp && evaluation.margin<12)) {
      outcome.status='ambiguous-or-weak'
      outcome.reason=evaluation.runnerUp && evaluation.margin<12
        ? 'ambiguous_margin' : (evaluation.reason || 'weak-search-evidence')
      outcomes.push(outcome);continue
    }
    if(!bestId || !titleAliasMatch(names[0],best)) {
      outcome.status='weak-title-evidence';outcome.reason='not-exact-local-or-original'
      outcomes.push(outcome);continue
    }
    if(!Number.isInteger(outcome.bestYear)) {
      outcome.status='missing-tmdb-year';outcome.reason='no-known-film-year'
      outcomes.push(outcome);continue
    }
    if(!detailCache.has(bestId)) {
      detailCalls++
      detailCache.set(bestId,Promise.resolve().then(()=>loadDetails({type:'movie',tmdbId:bestId})))
    }
    const detail=await detailCache.get(bestId)
    const delta=runtimeAgreement(durationSeconds(video?.contentDetails?.duration),Number(detail?.runtimeMinutes))
    outcome.runtimeDelta=delta.delta
    if(filmYear(detail?.year)!==outcome.bestYear) {
      outcome.status='inconsistent-tmdb-year';outcome.reason='search-vs-detail'
    } else if(!delta.checked) {
      outcome.status='missing-runtime';outcome.reason='no-runtime-evidence'
    } else if(delta.delta>10) {
      outcome.status='runtime-conflict';outcome.reason='over-10-minutes'
    } else {
      // This is still NOT a verified film. No independent video film year or playback test.
      outcome.status='priority-manual-review';outcome.reason='exact-alias-and-runtime'
    }
    outcomes.push(outcome)
  }
  const counts={}
  for(const x of outcomes)counts[x.status]=(counts[x.status]||0)+1
  const lines=['## G1 – Sechs neue TMDB-Suchhinweise konservativ nachbewertet','',
    '- Gleicher existierender MovieHub-Waipu-TMDB-Scorer; **keine automatische Filmidentität**.',
    '- Suchkandidaten inkl. Konkurrenztreffern, Titelalias, TMDB-Jahr und TMDB-/Videolaufzeit.',
    '- Ein auch hier günstiger Befund bedeutet ausschließlich **Priorität zur menschlichen Werkprüfung**.',
    '- YouTube-Uploadjahr wird nicht als Filmerscheinungsjahr verwendet.',
    '',
    '| YouTube-Video | TMDB-Bestkandidat | Konkurrierende ID | Laufzeitdelta | Diagnose |',
    '| --- | --- | ---: | ---: | --- |']
  for(const x of outcomes) lines.push('| [Video](https://www.youtube.com/watch?v='+x.videoId+') | '+
      (x.bestId?'[movie:'+x.bestId+'](https://www.themoviedb.org/movie/'+x.bestId+')':'–')+
      ' | '+(x.runnerUpId??'–')+' | '+(x.runtimeDelta??'n. a.')+
      ' | '+x.status+' ('+(x.reason||'')+') |')
  lines.push('', '- Nachbewertete Videos: **'+outcomes.length+'**; TMDB-Detailprüfungen: **'+detailCalls+'**.',
    '- Gruppen: '+JSON.stringify(counts)+'.',
    '- Weder legale Verbreitung noch tatsächliches DE-/Android-/Fire-TV-Playback wurden getestet.','')
  return {outcomes,counts,detailCalls,report:lines.join('\n')}
}

export async function probeLanguageAndPageTwo({ rows }, { searchDiagnostic, maxVideos = LANGUAGE_PROBE_CAP } = {}) {
  if(typeof searchDiagnostic!=='function')throw new TypeError('TMDB diagnostic lookup required')
  // Only the 14 without fresh safe variants from the preceding A/B report.
  const selected=(rows||[]).filter(x=>isVideoId(x.videoId)&&(!x.alternatives?.length)&&(!x.hints?.length))
    .slice(0,Math.min(LANGUAGE_PROBE_CAP,maxVideos))
  const outcomes=[]
  let requests=0
  let page2=0
  for(const item of selected) {
    const query=String(item.oldTitle||item.searchTitle||'').trim()
    if(query.length<4 || query.length>120) {
      outcomes.push({videoId:item.videoId,query,status:'invalid-query',requests:0,candidates:[]})
      continue
    }
    const first=await searchDiagnostic({type:'movie',title:query,language:'en-US',page:1})
    requests++
    if(!Array.isArray(first?.results) || !Number.isInteger(first?.totalPages))
      throw new Error('Invalid language diagnostic response')
    let results=first.results.slice(0,20)
    // Page 2 is evidence discovery, never a match confidence rule.
    if(first.totalPages>1) {
      const second=await searchDiagnostic({type:'movie',title:query,language:'en-US',page:2})
      requests++;page2++
      if(!Array.isArray(second?.results))throw new Error('Invalid page-2 diagnostic response')
      results.push(...second.results.slice(0,20))
    }
    const candidates=uniqueResults(results)
    const decision=chooseWaipuTmdbMatch({type:'movie',title:query},candidates)
    const credible=candidates.filter(x=>titleAliasMatch(query,x))
    const status=!candidates.length?'no-results':
      credible.length===0?'results-but-no-exact-alias':
      !decision.best || decision.best.score<70 || (decision.runnerUp && decision.margin<12)
        ?'ambiguous-or-weak':'candidate-hint-only'
    outcomes.push({videoId:item.videoId,query,status,requests:1+(first.totalPages>1?1:0),
      candidates:credible.map(x=>({id:tmdbId(x),year:filmYear(String(x.release_date||'').slice(0,4))})).slice(0,4)})
  }
  const counts={}
  for(const x of outcomes)counts[x.status]=(counts[x.status]||0)+1
  const lines=['## G1 – Kodi-inspirierte englische Suche und TMDB-Ergebnisseite 2','',
    '- **Ausschließlich** auf bisher ohne zusätzliche bereinigte Titelvariante gebliebene Testvideos.',
    '- Sprache en-US und Seite 2 nur bei \`total_pages > 1\`; max. 14 Videos, 28 TMDB-Anfragen vor Cache.',
    '- Weder Trefferpopularität noch eine andere Sprache beweisen Filmidentität.',
    '',
    '| YouTube-Video | TMDB Suchanfrage | Seite 2? | TMDB-ID-Hinweis | Ergebnis |',
    '| --- | --- | --- | --- | --- |']
  for(const x of outcomes) lines.push('| [Video](https://www.youtube.com/watch?v='+x.videoId+') | '+
    safe(x.query)+' | '+(x.requests>1?'ja':'nein')+' | '+
    (x.candidates.map(z=>'[movie:'+z.id+'](https://www.themoviedb.org/movie/'+z.id+')').join(', ')||'–')+
    ' | '+x.status+' |')
  lines.push('', '- Englisch-/Seite-2-Testvideos: **'+outcomes.length+'**; TMDB-Aufrufe vor Cache: **'+requests+'**, davon Seite 2: **'+page2+'**.',
    '- Gruppen: '+JSON.stringify(counts)+'.',
    '- Bestehende Baseline und Filmidentitäten bleiben unverändert.', '')
  return {outcomes,counts,requests,page2,report:lines.join('\n')}
}
