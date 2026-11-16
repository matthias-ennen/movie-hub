/**
 * Bounded, anonymized MovieHub 00:10 chain report (#388).
 * Only project explicitly named numeric QA fields; never copy raw source
 * artifacts, video IDs, watch URLs, titles, private GCS data or API errors.
 * Publishing this report never mutates MovieHub or calls a provider API.
 */
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {sanitizeDataMetrics,compareNightly,phaseTimings,fetchNightlyJobs,writeJson,berlinDay} from './nightly-report-metrics.mjs'

const OUT='artifacts/moviehub-nightly'
const source={
  discovery:'artifacts/youtube-g2/nightly-discovery/summary.json',
  youtube:'artifacts/youtube-g2/bidirectional-coverage/qa.json',
  waipu:'public/waipu-live/index.json',
  joyn:'public/joyn-live/index.json',
  tv:'public/tv-runtime/index.json',
  dataMetrics:'artifacts/nightly-metrics/aggregate.json',
  known:'artifacts/nightly-metrics/known.json',
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
  repository=null,generatedAt=new Date().toISOString(),jobs=[],history=[],expectMetrics=false,runDay=null,scheduled=false}={}){
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
      'youtube-search-rate-limit-not-confirmed-quota',
      'controlled-stop-before-github-timeout'].includes(d.terminationReason)
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
      titles:n(tv.titleShardTitleCount),titleDayEntries:n(tv.titleCount),airings:n(tv.airingCount),
      providerCount:Array.isArray(tv.providers)?n(tv.providers.length):null,
      observedAt:safeTime(tv.generatedAt),
    }:null,
  }
  const dataMetrics=sanitizeDataMetrics(sourceData.dataMetrics)
  const known=sourceData.known?.kind==='moviehub-nightly-known-counts'?Object.fromEntries(['globalStoredCandidateFilms','sharedCheckpointCandidateFilms','deferredCandidateFilms','crossTitleCollisionFilms','currentBadgeCachedFilms','cachedFilmsWithoutCurrentPublicBadge','filmsWithCurrentTmdbDeYoutubeOffers','filmsWithoutCurrentTmdbDeYoutubeOffers','reusedVideoCandidateIds','avoidedYoutubeSearchCalls','rowsChecked','searchCalls','videosListBatches','tmdbReadCalls'].map(k=>[k,n(sourceData.known[k])])):null
  if(known)known.reviewStatuses=Object.fromEntries(["review-single-video-candidate","review-multiple-video-editions","review-weak-or-unresolved-videos","no-video-candidate","no-current-tmdb-de-youtube-offer","no-current-public-youtube-badge"].map(k=>[k,n(sourceData.known.reviewStatuses?.[k])]))
  const firebaseSucceeded=steps.firebase==='success'
  const missingQA=Object.entries(qa).filter(([,v])=>!v).map(([k])=>k)
  const status=!firebaseSucceeded?'publish-not-confirmed'
    :missingQA.length?'incomplete-evidence'
      :steps.discovery==='success'&&steps.known==='success'
        &&!['rate-limited-stalled','time-budget-reached','running'].includes(quota?.status)?'success':'degraded'
  const id=n(Number(runId)),attempt=n(Number(runAttempt))
  const goodRepo=typeof repository==='string'
    &&/^[-\w]+\/[-\w.]+$/.test(repository)?repository:null
  const report={
    kind:'moviehub-nightly-complete-chain',schemaVersion:2,
    generatedAt:safeTime(generatedAt),
    run:id&&id>0&&goodRepo?{
      id,attempt,url:`https://github.com/${goodRepo}/actions/runs/${id}`,
    }:null,
    status,steps,sourceQaAvailability:Object.fromEntries(
      Object.entries(qa).map(([k,v])=>[k,Boolean(v)])),
    adapters:qa,dataMetrics,knownVideoReview:known,phaseTimings:phaseTimings(jobs),
    youtubeDiscoveryQuota:quota,
    // A reservation is not proof of an actual search call. This report does
    // not have authenticated quota data or make any offer/right assertions.
    youtubeSearchCallsMeasuredHere:quota?.actualSearchAttempts!==null&&quota!==null,
    googleRemainingQuota:null,
    sourceVideoIdsIncluded:false,verifiedDEOfferInferred:false,
    productionMutationsByReport:0,
  }
  if(dataMetrics){
    const phaseSteps={tmdb:['tmdb'],waipu:['waipuSync','waipu'],joyn:['joyn'],cache:['cacheRestore','cacheSave'],xmltv:['xmltvStage','xmltvMatch'],canonical:['youtube','canonical','xmltvCanonical','xmltvPublish'],tv:['tv'],publish:['publish']}
    for(const p of report.phaseTimings){
      const states=phaseSteps[p.key]?.map(k=>dataMetrics.steps[k])
      if(states?.includes('failure'))p.result='failure'
      else if(states?.includes('cancelled'))p.result='cancelled'
      else if(states?.every(x=>x==='skipped'))p.result='skipped'
      else if(states?.some(x=>x!=='success'))p.result='unknown'
    }
  }
  const comparisons=compareNightly(report,history,runDay||berlinDay(report.generatedAt))
  report.comparison=comparisons.rows
  report.history=comparisons.history
  report.historyAccepted=comparisons.accepted
  const required=['tmdb','waipuSync','waipu','joyn','cacheRestore','cacheSave','xmltvStage','xmltvMatch','xmltvCanonical','xmltvPublish','youtube','tv','canonical','publish']
  const warnings=[]
  if(quota?.status==='rate-limited-stalled'){
    warnings.push('YouTube Discovery: '+fmt(quota.rateLimitResponses)+' Drosselungen bei '+fmt(quota.actualSearchAttempts)+' Suchversuchen; '+fmt(quota.successfulSearchCalls)+' erfolgreich. Google-Tagesquota nicht bestätigt; Drosselung beheben.')
    const phase=report.phaseTimings.find(p=>p.key==='discovery')
    if(phase?.result==='success')phase.result='degraded'
  }else if(['time-budget-reached','running'].includes(quota?.status)){
    warnings.push('YouTube Discovery: Suchlauf nicht vollständig abgeschlossen; offene Kandidaten später nachholen.')
    const phase=report.phaseTimings.find(p=>p.key==='discovery')
    if(phase?.result==='success')phase.result='degraded'
  }
  if(steps.discovery==='failure')warnings.push('YouTube Discovery fehlgeschlagen; bestehende gültige Daten weiterverwendet, Ursache prüfen.')
  if(steps.known==='failure')warnings.push('YouTube Bestandsprüfung fehlgeschlagen; aktuelle Linkprüfung nicht bestätigt.')
  if(known?.crossTitleCollisionFilms>0)warnings.push('YouTube: '+fmt(known.crossTitleCollisionFilms)+' Filmidentitäten wegen titelübergreifender Video-ID-Kollisionen zurückgestellt; Identität vor Nutzung prüfen.')
  if(expectMetrics&&dataMetrics&&!dataMetrics.xmltv.canonical)warnings.push('XMLTV: Post-Canonical-Zähler fehlen; tatsächliche Zuordnung nach Metadatenübernahme prüfen.')
  const gateStart=report.phaseTimings.find(p=>p.key==='gate')?.start
  if(scheduled&&gateStart){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(gateStart)).map(p=>[p.type,p.value]))
    const delay=Number(parts.hour)*60+Number(parts.minute)-10
    if(delay>5)warnings.push('Geplanter Nightly-Start 00:10 Uhr: tatsächlich '+parts.hour+':'+parts.minute+' Uhr ('+delay+' Minuten später). Zeitplan/Runner-Start prüfen.')
  }
  if(expectMetrics&&!dataMetrics)warnings.push('Messdaten aus dem Datenlauf fehlen; detaillierte Bewertung nicht möglich.')
  if(expectMetrics&&!known)warnings.push('Zähler der YouTube-Bestandsprüfung fehlen.')
  if(expectMetrics&&!quota)warnings.push('Zähler der YouTube-Suche fehlen.')
  if(dataMetrics){
    for(const k of required)if(dataMetrics.steps[k]!=='success')warnings.push('Phase '+k+': '+dataMetrics.steps[k]+'; Datenstand und Ersatzdaten prüfen.')
    if(dataMetrics.xmltv.publication?.retainedStations>0)warnings.push('XMLTV: mindestens ein Sender nutzt den vorherigen Stand.')
    if(dataMetrics.xmltv.publication?.stations===0)warnings.push('XMLTV: keine Sender veröffentlicht; Quelleneinlesung und Zuordnung prüfen.')
    if(!dataMetrics.cache.waipu||!dataMetrics.cache.joyn)warnings.push('Gemeinsamer Cache: Messung mindestens eines Adapters fehlt.')
    if(!dataMetrics.xmltv.match||!dataMetrics.xmltv.publication)warnings.push('XMLTV: Zuordnungs- oder Veröffentlichungszähler fehlen.')
  }
  for(const row of comparisons.rows)if(['critical','review','warning'].includes(row.severity))warnings.push(row.label+': Rückgang gegenüber Vergleichsstand; Ursache prüfen.')
  else if(row.severity==='increase')warnings.push(row.label+': Zunahme von mindestens 20 %; Wachstum oder Duplikate prüfen.')
  else if(expectMetrics&&['stale','unknown'].includes(row.severity))warnings.push(row.label+': kein bestätigter frischer Messwert.')
  if(expectMetrics&&!report.phaseTimings.some(p=>p.start))warnings.push('GitHub-Laufzeiten nicht verfügbar.')
  if(dataMetrics&&dataMetrics.steps.publish!=='success')report.status='publish-not-confirmed'
  report.warnings=warnings
  if(report.status==='success'&&warnings.length)report.status='degraded'
  return report
}
const fmt=v=>v===null||v===undefined?'nicht verfügbar':typeof v==='number'?v.toLocaleString('de-DE'):String(v)
const pc=v=>v===null||v===undefined?'nicht verfügbar':fmt(v)+' %'
const localTime=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'–'
const dur=v=>v===null?'–':Math.floor(v/3600)+' h '+Math.floor(v%3600/60)+' min '+v%60+' s'
const phaseStatus={degraded:'🟡 eingeschränkt',success:'🟢 erfolgreich',failure:'🔴 fehlgeschlagen',unknown:'⚪ nicht belegt',skipped:'⏭️ übersprungen',cancelled:'🔴 abgebrochen'}
function timingMarkdown(phases=[]){
  return ['','### Zeitlicher Ablauf (MEZ/MESZ)','',
    '| Phase | Beginn | Ende | Zeitspanne | Ergebnis |','|---|---|---|---:|---|',
    ...phases.map(p=>'| '+p.label+' | '+localTime(p.start)+' | '+localTime(p.end)+' | '+dur(p.seconds)+' | '+phaseStatus[p.result]+' |'),
    '', 'Zeitspannen umfassen die zugehörigen Arbeitsschritte; übergreifende Phasen können sich überschneiden.','']
}
function dataMarkdown(report){
  const m=report.dataMetrics,k=report.knownVideoReview,t=m?.tmdb,x=m?.xmltv,c=m?.cache
  const lines=['## YouTube – Bestandsprüfung ohne Suche','']
  if(k)lines.push('- Geprüfte Filmidentitäten: '+fmt(k.globalStoredCandidateFilms)+' von '+fmt(k.sharedCheckpointCandidateFilms)+' · '+fmt(k.deferredCandidateFilms)+' noch offen',
    '- Filme mit / ohne aktuelles öffentliches Badge: '+fmt(k.currentBadgeCachedFilms)+' / '+fmt(k.cachedFilmsWithoutCurrentPublicBadge),
    '- Wiederverwendete Video-Kandidaten: '+fmt(k.reusedVideoCandidateIds)+' · videos.list: '+fmt(k.videosListBatches)+' · search.list: '+fmt(k.searchCalls),
    '- Kandidatenprüfung: '+fmt(k.reviewStatuses?.['review-single-video-candidate'])+' eindeutige starke Kandidaten · '+fmt(k.reviewStatuses?.['review-multiple-video-editions'])+' mehrere starke Varianten · '+fmt(k.reviewStatuses?.['review-weak-or-unresolved-videos'])+' schwach/ungeklärt · '+fmt(k.reviewStatuses?.['no-video-candidate'])+' ohne Kandidat · '+fmt(k.reviewStatuses?.['no-current-tmdb-de-youtube-offer'])+' ohne aktuelles TMDB-Angebot.',
    '- Gemessene vermiedene Suchanfragen: '+fmt(k.avoidedYoutubeSearchCalls)+'; kein Beleg für ein neues verifiziertes Angebot.')
  else lines.push('- Kein bestätigter Zähler aus der Bestandsprüfung.')
  lines.push('','## TMDB – Katalog und Suchindex','')
  if(t)lines.push('- Browse-Bestand: '+fmt(t.catalog)+' Titel ('+fmt(t.movies)+' Filme, '+fmt(t.series)+' Serien)',
    '- Suchindex: '+fmt(t.search)+' Titel ('+fmt(t.searchMovies)+' Filme, '+fmt(t.searchSeries)+' Serien)',
    '- Suchindex neu / entfernt / Angebote geändert: '+fmt(t.addedCount)+' / '+fmt(t.removedCount)+' / '+fmt(t.changedOfferCount),
    '- Änderungen von TMDB gemeldet (Filme / Serien): '+fmt(t.changedMovies)+' / '+fmt(t.changedSeries),
    '- Vollständige Details / offene Details: '+fmt(t.completeDetails)+' / '+fmt(t.pendingDetails),
    '- Verfügbare / angeforderte Staffeln: '+fmt(t.seasonAvailable)+' / '+fmt(t.seasonRequested),
    '- Suchläufe abgeschlossen / geplant / begrenzt: '+fmt(t.completed)+' / '+fmt(t.expected)+' / '+fmt(t.capped))
  else lines.push('- Keine bestätigten Katalogkennzahlen.')
  lines.push('','## EPG – Einlesen und Zuordnung','',
    '| Quelle | Sender | Eingelesen | Kandidaten | Zugeordnet | Quote | Veröffentlichte Ausstrahlungen | Vorschau |',
    '|---|---:|---:|---:|---:|---:|---:|---:|')
  for(const [name,a] of [['Waipu',m?.waipu],['Joyn',m?.joyn]])lines.push('| '+name+(a&&!a.fresh?' (vorheriger Bestand)':'')+' | '+[a?.stations,a?.read,a?.candidates,a?.matched].map(fmt).join(' | ')+' | '+pc(a?.matchPercent)+' | '+fmt(a?.airings)+' | '+fmt(a?.horizonDays)+' Tage |')
  lines.push('| XMLTV | '+[x?.availableStations,x?.stagedRows,x?.match?.selectedCandidates,x?.match?.combinedMatched].map(fmt).join(' | ')+' | '+pc(x?.matchPercent)+' | '+fmt(x?.publication?.airings)+' | '+fmt(x?.maxHorizonDays)+' Tage |',
    '', 'Zuordnungsquote = zugeordnete / geprüfte Kandidaten derselben Quelle; die Kandidateneinheit unterscheidet sich je Adapter. XMLTV-Vorschau = maximaler beobachteter Horizont, kein garantierter lückenloser Zeitraum.',
    '- XMLTV: '+fmt(x?.stagedSources)+' Feeds, '+fmt(x?.families)+' unabhängige Familien · '+fmt(x?.publication?.freshStations)+' neue Sendergenerationen, '+fmt(x?.publication?.retainedStations)+' beibehaltene Sendergenerationen.',
    '- XMLTV: '+fmt(x?.match?.additionalMatched)+' zusätzliche Zuordnungen durch gemeinsamen Cache / begrenzte Suche; '+fmt(x?.match?.approvedUniqueTitles)+' eindeutige freigegebene Titel im Vorabvergleich; '+fmt(x?.match?.deduplicatedRuntimeAirings)+' eindeutige Ausstrahlungen in dessen Vorschau.',
    '- XMLTV nach dem kanonischen Abgleich: '+fmt(x?.canonical?.received)+' Programmzeilen, '+fmt(x?.canonical?.eligible)+' zulässig, '+fmt(x?.canonical?.completeUniqueTitles)+' vollständige Titel, '+fmt(x?.canonical?.pendingUniqueTitles)+' offene Titel, '+fmt(x?.canonical?.unresolved)+' unaufgelöst, '+fmt(x?.canonical?.deduplicated)+' Dubletten entfernt.',
    '- XMLTV veröffentlicht: '+fmt(x?.publication?.stations)+' Sender, '+fmt(x?.publication?.airings)+' Ausstrahlungen · '+fmt(x?.publication?.expiredAirings)+' abgelaufen · '+fmt(x?.publication?.missingCanonicalAirings)+' ohne vollständige kanonische Metadaten.',
    '','## Gemeinsamer TMDB-Cache','',
    '| Adapter | Tatsächliche Suchstarts | Vermiedene Starts durch Cache | Vortags-/Laufübergreifend | Im selben Lauf |','|---|---:|---:|---:|---:|')
  for(const [name,a] of [['Waipu',c?.waipu],['Joyn',c?.joyn]])lines.push('| '+name+' | '+[a?.actualSearchStarts,a?.avoidedInitialSearches,a?.priorRunHits,a?.sameRunHits].map(fmt).join(' | ')+' |')
  lines.push('| Gesamt (Waipu + Joyn) | '+fmt(c?.actualSearchStarts)+' | '+fmt(c?.avoidedInitialSearches)+' | – | – |',
    '', '- XMLTV: '+fmt(x?.match?.cacheResponseHits)+' Cache-Antworttreffer, '+fmt(x?.match?.newTmdbApiRequests)+' zusätzliche Suchrequests im Matching; '+fmt(x?.match?.cacheWrites)+' neu erfasste Antworten.',
    '- XMLTV: '+fmt(x?.match?.apiLookupRows)+' Zeilen mit Suchbedarf, '+fmt(x?.match?.apiDistinctKeys)+' eindeutige Schlüssel, '+fmt(x?.match?.apiRepeatedKeys)+' wiederverwendete Schlüssel; '+fmt(x?.match?.apiCandidateRows)+' Zeilen mit eindeutigem Suchkandidaten.',
    '- XMLTV: '+fmt(x?.match?.apiBudgetMisses)+' wegen Budget nicht gesuchte Schlüssel, '+fmt(x?.match?.apiFailedRequests)+' fehlgeschlagene Requests, '+fmt(x?.match?.apiStoppedMisses)+' nach Transportfehler nicht gesuchte Schlüssel.',
    '- Vermiedene initiale Suchstarts sind gemessen; keine Hochrechnung auf alle TMDB-Aufrufe.',
    '','## Gemeinsame TV-Daten / Veröffentlichung','',
    '- TV-Runtime: '+fmt(report.adapters.tv?.titles)+' eindeutige Titel · '+fmt(report.adapters.tv?.titleDayEntries)+' Titel-Tages-Einträge (derselbe Titel an mehreren Tagen zählt mehrfach) · '+fmt(report.adapters.tv?.airings)+' Ausstrahlungen · '+fmt(report.adapters.tv?.providerCount)+' Anbieter.',
    '- Hosting-Readback: '+(phaseStatus[m?.steps.publish]||'⚪ nicht belegt')+'.','')
  return lines
}
function comparisonMarkdown(report){
  const icons={critical:'🔴 kritisch',review:'🟠 prüfen',warning:'🟡 auffällig',ok:'🟢 unauffällig',unknown:'⚪ nicht messbar',stale:'🟡 nicht frisch','no-baseline':'⚪ Ausgangswert',increase:'🟡 starke Zunahme'}
  return ['| Kennzahl | Heute | Letzter Vergleich | Abweichung | 7-Tage-Mittel (n) | Abweichung | Bewertung |','|---|---:|---:|---:|---:|---:|---|',
    ...(report.comparison||[]).map(r=>'| '+r.label+' | '+fmt(r.value)+' | '+fmt(r.previous)+(r.previousDay?' ('+r.previousDay+')':r.previousIsPublishedBaseline?' (vorher veröffentlicht)':'')+' | '+pc(r.delta)+' | '+fmt(r.mean)+' ('+r.samples+') | '+pc(r.trend)+' | '+icons[r.severity]+' |'),
    '', 'Rückgänge ab 5 % auffällig, ab 10 % prüfbedürftig, ab 20 % kritisch; Nullbestand nach positivem Vergleich kritisch; Zunahmen ab 20 % zur Plausibilitätsprüfung. Nur bestätigte frische Messwerte gehen in die Historie ein. Das 7-Tage-Mittel wächst mit den gemessenen Läufen; fehlende Werte sind keine Nullen.',
    '', ...(report.warnings?.length?report.warnings.map(x=>'- '+x):['- Keine konkreten Auffälligkeiten in den vorhandenen Messwerten.'])]
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
    '## Zusammenfassung','',
    report.status==='success'?'Alle belegten Phasen erfolgreich; keine Warnung erkannt.':report.status==='degraded'?'Veröffentlichung erfolgt, aber mindestens ein Teilbereich benötigt Aufmerksamkeit.':'Veröffentlichung oder vollständige Belege fehlen.',
    ...(report.warnings?.length?['',...report.warnings.map(x=>'- '+x)]:[]),'',
    '## Ablauf','',
    ...Object.entries(stageNames).map(([k,name])=>'- '+name+': **'+report.steps[k]+'**'),
    '',
    ...timingMarkdown(report.phaseTimings),
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
    ...dataMarkdown(report),
    '## Adapter und Datenquellen (Bestand und ergänzende Belege)','',
  ]
  for(const [key,title,props] of [
    ['youtube','YouTube',['sourceVideos','playlistEditorialLinks','playlistReviewCases','newCanonicalTmdbMetadata','publicYoutubeBadgedMovies','independentlyVerifiedDETitleRoutes']],
    ['waipu','Waipu',['stations','titles','broadcasts','status']],
    ['joyn','Joyn',['stations','airings','status']],
    ['tv','TV-Runtime / gemeinsame Quelle',['titles','titleDayEntries','airings','providerCount']],
  ]){
    const a=report.adapters[key]
    lines.push('### '+title)
    lines.push(a?props.map(p=>'- '+p+': '+(a[p]??'unbekannt')).join('\n')
      :'- Quell-QA aus diesem Deploy nicht verfügbar (kein bestätigter Wert).')
    if(a?.observedAt)lines.push('- Datenstand: '+a.observedAt)
    lines.push('')
  }
  lines.push('## Abweichungen und Handlungsbedarf','',...comparisonMarkdown(report),'',
    '## Sicherheit und Interpretation','',
    '- Discovery-Fehler bleiben sichtbar; Firebase kann den letzten validierten Datenstand weiter veröffentlichen.',
    '- Keine YouTube-Restquote aus diesem Bericht abgeleitet; keine Such-Reservierung durch den Bericht.',
    '- Playlist-/Best-Effort-Links sind keine unabhängig belegten deutschen Kauf-/Leih-/Gratisangebote.',
    '- Keine Rohvideo-IDs, Watch-URLs, privaten Queue-Einträge oder sensiblen API-Fehler im Bericht.',
    '- GitHub-Run-Status und tatsächliche Firebase-Hosting-Readbacks sind getrennt zu prüfen.','')
  return lines.join('\n')
}
export async function saveNightlyReport({env=process.env,input=readFile,out=OUT,fetchImpl=fetch}={}){
  const historyPath=out+'/history.json'
  const history=await load(input,historyPath)
  const jobs=await fetchNightlyJobs(env,fetchImpl)
  const runDay=berlinDay(jobs.find(j=>j.name==='Enforce one trusted scheduled night per Berlin day')?.started_at)
  const report=buildNightlyReport({
    stages:{
      gate:env.NIGHT_GATE_RESULT,discovery:env.NIGHT_DISCOVERY_RESULT,
      known:env.NIGHT_KNOWN_RESULT,firebase:env.NIGHT_FIREBASE_RESULT,
    },
    sourceData:Object.fromEntries(await Promise.all(
      Object.entries(source).map(async ([k,p])=>[k,await load(input,p)]))),
    repository:env.GITHUB_REPOSITORY,
    runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
    jobs,history,expectMetrics:env.NIGHT_EXPECT_METRICS==='1',runDay,scheduled:env.GITHUB_EVENT_NAME==='schedule',
  })
  const jsonPath=out+'/summary.json',mdPath=out+'/report.md'
  await mkdir(dirname(jsonPath),{recursive:true})
  await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  if(report.historyAccepted)await writeJson(historyPath,report.history)
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
