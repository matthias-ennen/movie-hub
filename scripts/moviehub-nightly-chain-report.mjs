/**
 * Bounded, anonymized MovieHub 00:10 chain report (#388).
 * Only project explicitly named numeric QA fields; never copy raw source
 * artifacts, video IDs, watch URLs, titles, private GCS data or API errors.
 * Publishing this report never mutates MovieHub or calls a provider API.
 */
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'

const OUT='artifacts/moviehub-nightly'
const source={
  discovery:'artifacts/youtube-g2/nightly-discovery/summary.json',
  youtube:'artifacts/youtube-g2/bidirectional-coverage/qa.json',
  waipu:'public/waipu-live/index.json',
  joyn:'public/joyn-live/index.json',
  tv:'public/tv-runtime/index.json',
}
const n=x=>Number.isSafeInteger(x)&&x>=0?x:null
const safeTime=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x))
  ?new Date(x).toISOString():null
const result=x=>['success','failure','skipped','cancelled'].includes(x)?x:'unknown'

async function load(input,path){
  try{return JSON.parse(await input(path,'utf8'))}
  catch{return null}
}
export function buildNightlyReport({stages,sourceData={},runId=null,runAttempt=null,
  repository=null,generatedAt=new Date().toISOString()}={}){
  const steps=Object.fromEntries(
    ['gate','discovery','known','firebase'].map(k=>[k,result(stages?.[k])]))
  const youtube=sourceData.youtube?.kind==='moviehub-youtube-g2-bidirectional-coverage-baseline'
    ?sourceData.youtube:null
  const wf=sourceData.waipu?.kind==='waipu-live-index'?sourceData.waipu:null
  const joyn=sourceData.joyn?.kind==='joyn-live-index'?sourceData.joyn:null
  const tv=sourceData.tv?.kind==='moviehub-tv-runtime-index'?sourceData.tv:null
  const d=sourceData.discovery?.kind==='moviehub-youtube-g2-nightly-budgeted-discovery'
    ?sourceData.discovery:null
  const quota=d?{
    status:['completed','quota-exhausted-confirmed','internal-safety-cap-reached',
      'daily-budget-exhausted','no-unknown-public-films',
      'no-current-offer-candidates','rate-limited-stalled','time-budget-reached','running','failed'].includes(d.status)?d.status:'unknown',
    mode:['real-google-quota-until-confirmed-403',
      'google-enforced-no-internal-daily-cap'].includes(d.quotaMode)
      ?d.quotaMode:'other-or-unknown',
    pacificDay:typeof d.pacificDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.pacificDate)
      ?d.pacificDate:null,
    priorReserved:n(d.priorReserved),reservedForNight:n(d.selectedForSearch),
    actualSearchAttempts:n(d.searchCalls),
    successfulSearchCalls:n(d.successfulSearchCalls),
    rateLimitResponses:n(d.rateLimitResponses),
    rateLimitHttp429:n(d.rateLimitHttp429),rateLimitHttp403:n(d.rateLimitHttp403),
    rateLimitUnclassified:n(d.rateLimitUnclassified),
    rateLimitRetryAfterHints:n(d.rateLimitRetryAfterHints),
    rateLimitFirstAt:safeTime(d.rateLimitFirstAt),
    rateLimitLastAt:safeTime(d.rateLimitLastAt),
    uncertainSearchAttempts:n(d.uncertainSearchAttempts),
    rejectedSearchCalls:n(d.searchCalls)!==null&&n(d.successfulSearchCalls)!==null
      ?Math.max(0,d.searchCalls-d.successfulSearchCalls):null,
    quotaExceededConfirmed:d.quotaExceededConfirmed===true,
    quotaSafetyCeiling:n(d.dayLimit),
    unusedReservedSearches:n(d.unusedReservedSearches),
    newCandidateFilms:n(d.savedNewCandidateFilms),
    pendingCandidateFilms:n(d.stillEligible),
    terminationReason:['youtube-search-list-403-quotaExceeded',
      'internal-safety-cap-not-google-exceeded',
      'eligible-tmdb-film-candidates-exhausted',
      'youtube-search-rate-limit-not-confirmed-quota'].includes(d.terminationReason)
      ?d.terminationReason:null,
  }:null
  const qa={
    youtube:youtube?{
      sourceVideos:n(youtube.youtubeFirst?.sourceVideos),
      playlistEditorialLinks:n(youtube.youtubeFirst?.editorialDirectLinks),
      playlistReviewCases:n(youtube.youtubeFirst?.reviewOnlyVideos),
      newCanonicalTmdbMetadata:n(youtube.youtubeFirst?.newTmdbFilmMetadata),
      publicYoutubeBadgedMovies:n(youtube.tmdbFirst?.publicYoutubeBadgedMovies),
      independentlyVerifiedDETitleRoutes:n(youtube.totalVerifiedDETitleRoutes),
      observedAt:safeTime(youtube.generatedAt),
    }:null,
    waipu:wf?{
      stations:n(wf.counts?.stations),titles:n(wf.counts?.titles),
      broadcasts:n(wf.counts?.broadcasts),
      status:wf.status==='complete'?'complete':'not-complete',
      observedAt:safeTime(wf.generatedAt),
    }:null,
    joyn:joyn?{
      stations:n(joyn.stationCount),airings:n(joyn.airingCount),
      status:joyn.status==='complete'?'complete':'not-complete',
      observedAt:safeTime(joyn.generatedAt),
    }:null,
    tv:tv?{
      titles:n(tv.titleCount),airings:n(tv.airingCount),
      providerCount:Array.isArray(tv.providers)?n(tv.providers.length):null,
      observedAt:safeTime(tv.generatedAt),
    }:null,
  }
  const firebaseSucceeded=steps.firebase==='success'
  const missingQA=Object.entries(qa).filter(([,v])=>!v).map(([k])=>k)
  const status=!firebaseSucceeded?'publish-not-confirmed'
    :missingQA.length?'incomplete-evidence'
      :steps.discovery==='success'&&steps.known==='success'
        &&!['rate-limited-stalled','time-budget-reached','running'].includes(quota?.status)?'success':'degraded'
  const id=n(Number(runId)),attempt=n(Number(runAttempt))
  const goodRepo=typeof repository==='string'
    &&/^[-\w]+\/[-\w.]+$/.test(repository)?repository:null
  return {
    kind:'moviehub-nightly-complete-chain',schemaVersion:1,
    generatedAt:safeTime(generatedAt),
    run:id&&id>0&&goodRepo?{
      id,attempt,url:`https://github.com/${goodRepo}/actions/runs/${id}`,
    }:null,
    status,steps,sourceQaAvailability:Object.fromEntries(
      Object.entries(qa).map(([k,v])=>[k,Boolean(v)])),
    adapters:qa,
    youtubeDiscoveryQuota:quota,
    // A reservation is not proof of an actual search call. This report does
    // not have authenticated quota data or make any offer/right assertions.
    youtubeSearchCallsMeasuredHere:quota?.actualSearchAttempts!==null&&quota!==null,
    googleRemainingQuota:null,
    sourceVideoIdsIncluded:false,verifiedDEOfferInferred:false,
    productionMutationsByReport:0,
  }
}
export function nightlyMarkdown(report){
  const stageNames={gate:'00:10 Start-/Doppellauf-Gate',
    discovery:'YouTube Discovery (limitierte Suche)',
    known:'YouTube videos.list Recheck (0 Suchen)',
    firebase:'Firebase Import + Hosting'}
  const lines=['# MovieHub · vollständiger Nachtlaufbericht','',
    '- Ergebnis: **'+report.status+'**',
    '- Zeitpunkt: '+(report.generatedAt??'unknown'),
    ...(report.run?['- GitHub: '+report.run.url]:[]),'',
    '## Ablauf','',
    ...Object.entries(stageNames).map(([k,name])=>'- '+name+': **'+report.steps[k]+'**'),
    '',
    '## YouTube-API: echte Suchanfragen','',
    ...(report.youtubeDiscoveryQuota?[
      '- Pacific-Tag: '+(report.youtubeDiscoveryQuota.pacificDay??'unbekannt'),
      '- Suchmodus: '+report.youtubeDiscoveryQuota.mode,
      '- Vorherige Reservierungen: '+(report.youtubeDiscoveryQuota.priorReserved??'unbekannt'),
      '- Für diese Nacht reserviert: '+(report.youtubeDiscoveryQuota.reservedForNight??'unbekannt'),
      '- Tatsächliche search.list-Versuche: '+(report.youtubeDiscoveryQuota.actualSearchAttempts??'nicht messbar'),
      '- Erfolgreiche search.list-Aufrufe: '+(report.youtubeDiscoveryQuota.successfulSearchCalls??'nicht messbar'),
      '- Rate-Limit-Antworten: '+(report.youtubeDiscoveryQuota.rateLimitResponses??'nicht messbar'),
      '- HTTP 429 / 403 Drosselungen: '+(report.youtubeDiscoveryQuota.rateLimitHttp429??'nicht messbar')+' / '+(report.youtubeDiscoveryQuota.rateLimitHttp403??'nicht messbar'),
      '- Mehrdeutige Drosselungs-Codes: '+(report.youtubeDiscoveryQuota.rateLimitUnclassified??'nicht messbar'),
      '- Retry-After-Hinweise von Google: '+(report.youtubeDiscoveryQuota.rateLimitRetryAfterHints??'nicht messbar'),
      '- Erste / letzte Drosselung: '+(report.youtubeDiscoveryQuota.rateLimitFirstAt??'unbekannt')+' / '+(report.youtubeDiscoveryQuota.rateLimitLastAt??'unbekannt'),
      '- Nicht sicher quittierte Versuche: '+(report.youtubeDiscoveryQuota.uncertainSearchAttempts??'nicht messbar'),
      '- Abgewiesene bzw. fehlgeschlagene Versuche: '+(report.youtubeDiscoveryQuota.rejectedSearchCalls??'nicht messbar'),
      '- Google quotaExceeded bestätigt: '+(report.youtubeDiscoveryQuota.quotaExceededConfirmed?'JA':'NEIN'),
      '- Endgrund: '+(report.youtubeDiscoveryQuota.terminationReason??report.youtubeDiscoveryQuota.status),
      '- Neue Filmkandidaten in privater Prüfung: '+(report.youtubeDiscoveryQuota.newCandidateFilms??'unbekannt'),
    ]:['- Discovery-Zähler nicht verfügbar; kein API-Verbrauch aus Reservierungen abgeleitet.']),
    '',
    '## Adapter und Datenquellen','',
  ]
  for(const [key,title,props] of [
    ['youtube','YouTube',['sourceVideos','playlistEditorialLinks','playlistReviewCases','newCanonicalTmdbMetadata','publicYoutubeBadgedMovies','independentlyVerifiedDETitleRoutes']],
    ['waipu','Waipu',['stations','titles','broadcasts','status']],
    ['joyn','Joyn',['stations','airings','status']],
    ['tv','TV-Runtime / gemeinsame Quelle',['titles','airings','providerCount']],
  ]){
    const a=report.adapters[key]
    lines.push('### '+title)
    lines.push(a?props.map(p=>'- '+p+': '+(a[p]??'unbekannt')).join('\n')
      :'- Quell-QA aus diesem Deploy nicht verfügbar (kein bestätigter Wert).')
    if(a?.observedAt)lines.push('- Datenstand: '+a.observedAt)
    lines.push('')
  }
  lines.push('## Sicherheit und Interpretation','',
    '- Discovery-Fehler bleiben sichtbar; Firebase kann den letzten validierten Datenstand weiter veröffentlichen.',
    '- Keine YouTube-Restquote aus diesem Bericht abgeleitet; keine Such-Reservierung durch den Bericht.',
    '- Playlist-/Best-Effort-Links sind keine unabhängig belegten deutschen Kauf-/Leih-/Gratisangebote.',
    '- Keine Rohvideo-IDs, Watch-URLs, privaten Queue-Einträge oder sensiblen API-Fehler im Bericht.',
    '- GitHub-Run-Status und tatsächliche Firebase-Hosting-Readbacks sind getrennt zu prüfen.','')
  return lines.join('\n')
}
export async function saveNightlyReport({env=process.env,input=readFile,out=OUT}={}){
  const report=buildNightlyReport({
    stages:{
      gate:env.NIGHT_GATE_RESULT,discovery:env.NIGHT_DISCOVERY_RESULT,
      known:env.NIGHT_KNOWN_RESULT,firebase:env.NIGHT_FIREBASE_RESULT,
    },
    sourceData:Object.fromEntries(await Promise.all(
      Object.entries(source).map(async ([k,p])=>[k,await load(input,p)]))),
    repository:env.GITHUB_REPOSITORY,
    runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
  })
  const jsonPath=out+'/summary.json',mdPath=out+'/report.md'
  await mkdir(dirname(jsonPath),{recursive:true})
  await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  const md=nightlyMarkdown(report)
  await writeFile(mdPath,md+'\n',{mode:0o600})
  if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,md+'\n')
  console.log(JSON.stringify({kind:report.kind,status:report.status,
    steps:report.steps,sourceQaAvailability:report.sourceQaAvailability,
    quotaKnown:false,publishedDEOffersImplied:false}))
  if(report.status==='incomplete-evidence'||report.status==='publish-not-confirmed')
    throw Error('MOVIEHUB_NIGHTLY_REPORT_INCOMPLETE_OR_FIREBASE_NOT_CONFIRMED')
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  saveNightlyReport().catch(e=>{console.error(e.message);process.exitCode=1})
