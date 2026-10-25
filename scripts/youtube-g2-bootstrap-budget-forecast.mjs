/**
 * One-shot READ-ONLY bootstrap forecast for the PUBLIC German YouTube badges.
 * The existing global PRIVATE checkpoint supplies candidate VIDEO ID presence,
 * NOT independently verified film/DE offers. No private/profile inventory,
 * YouTube search or provider writes.
 *
 * Research budget is a planning envelope, NOT an actual daily quota lease.
 */
import {createHash} from 'node:crypto'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {loadPublicMovieHubIndex} from './youtube-g2-tmdb-first-link-pilot.mjs'
import {validateCandidateCheckpoint} from './youtube-g2-durable-candidate-checkpoint.mjs'

export const FORECAST_KIND='moviehub-youtube-g2-bootstrap-search-budget-forecast'
export const FORECAST_OUTPUT='artifacts/youtube-g2/bootstrap-budget-forecast'
export const GLOBAL_CHECKPOINT_INPUT=
  'artifacts/youtube-g2/trusted-known-candidates/candidates.json'
export const CONFIGURED_SEARCHES_PER_DAY=100
export const PER_MISSING_FILM_SEARCHES=2
export const BUDGET_SCENARIOS=[10,20,40,80]
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
function publicBadged(entry){
  return (Array.isArray(entry?.providerIds)&&entry.providerIds.includes('youtube'))
    ||(Array.isArray(entry?.providerOffers)
      &&entry.providerOffers.some(x=>x?.id==='youtube'))
}
function validatedIndex(index,now){
  const checked=Date.parse(now),stamp=Date.parse(index?.generatedAt)
  if(index?.kind!=='search-index'||index.version!==1||index.country!=='DE'
    ||index.source==='fallback'||!Array.isArray(index.entries)
    ||index.count!==index.entries.length||index.count<1
    ||index.count>100000||!Number.isFinite(checked)||!Number.isFinite(stamp)
    ||checked-stamp< -86400000||checked-stamp>30*86400000)
    throw Error('YOUTUBE_BOOTSTRAP_FORECAST_PUBLIC_INDEX_UNTRUSTED')
}
export function createYoutubeBootstrapBudgetForecast({
  publicIndex,globalCheckpoint,now=new Date().toISOString(),
  dailyResearchSearchCalls=10,
}={}){
  validatedIndex(publicIndex,now)
  const checkpoint=validateCandidateCheckpoint(globalCheckpoint)
  if(!Number.isInteger(dailyResearchSearchCalls)
    ||dailyResearchSearchCalls<2||dailyResearchSearchCalls>20
    ||dailyResearchSearchCalls%2!==0)
    throw Error('YOUTUBE_BOOTSTRAP_RESEARCH_ENVELOPE_INVALID')
  const seen=new Set(),badged=[]
  for(const entry of publicIndex.entries){
    if(!publicBadged(entry)||entry?.type!=='movie')continue
    if(!Number.isSafeInteger(entry.tmdbId)||entry.tmdbId<1)
      throw Error('YOUTUBE_BOOTSTRAP_INVALID_PUBLIC_TMDB_ID')
    const key='movie:'+entry.tmdbId
    if(seen.has(key))continue
    seen.add(key)
    badged.push({tmdbId:entry.tmdbId,key})
  }
  badged.sort((a,b)=>a.tmdbId-b.tmdbId)
  const cached=new Map(checkpoint.entries.map(x=>[x.tmdbId,x.videoIds.length]))
  const missing=badged.filter(x=>!cached.has(x.tmdbId))
  const cachedOverlap=badged.filter(x=>cached.has(x.tmdbId))
  const notInPublicBadge=checkpoint.entries.length-cachedOverlap.length
  const scenario=BUDGET_SCENARIOS.map(calls=>{
    const filmsPerDay=calls/PER_MISSING_FILM_SEARCHES
    return {
      researchSearchCallsPerDay:calls,
      reservedForOtherSearchWorkflows:CONFIGURED_SEARCHES_PER_DAY-calls,
      candidateFilmsPerDay:filmsPerDay,
      minimumTheoreticalSearchDays:Math.ceil(missing.length/filmsPerDay),
    }
  })
  const plannedMovieLimit=dailyResearchSearchCalls/PER_MISSING_FILM_SEARCHES
  const selected=missing.slice(0,plannedMovieLimit)
  const plan={
    kind:FORECAST_KIND,
    generatedAt:now,
    publicIndexGeneratedAt:publicIndex.generatedAt,
    globalCheckpointUpdatedAt:checkpoint.updatedAt,
    publicBadgeMovieCount:badged.length,
    checkpointStoredCandidateMovieCount:checkpoint.entries.length,
    knownCandidateOverlapInPublicBadges:cachedOverlap.length,
    storedCandidatesOutsidePublicBadges:notInPublicBadge,
    publicBadgeFilmsWithoutCachedCandidates:missing.length,
    plannedDailyResearchSearchCalls:dailyResearchSearchCalls,
    plannedFilmsForSingleResearchEnvelope:selected.length,
    theoreticalSearchCallsForSingleEnvelope:selected.length*PER_MISSING_FILM_SEARCHES,
    configuredProjectSearchListDailyLimit:CONFIGURED_SEARCHES_PER_DAY,
    dailyLimitActuallyMeasuredFromCloud:true,
    publicQueueIdentity:digest(badged.map(x=>x.key)),
    candidateCheckpointIdentity:digest(checkpoint.entries.map(x=>[x.tmdbId,x.videoIds])),
    scenarios:scenario,
    // Selected public movie identities are *only* in the protected artifact.
    // The workflow intentionally DOES NOT feed this list to an API search job.
    selectedResearchHypotheses:selected,
    currentActualQuotaUsage:null,currentQuotaRemaining:null,
    availableSearchCallsGuaranteed:false,
    automaticallyRunSearch:false,
    newYoutubeSearchCalls:0,
    verifiedGermanOffers:0,confirmedPlaybackRoutes:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
    privateArtifact:true,publicationPermitted:false,
  }
  if(plan.publicBadgeMovieCount!==plan.knownCandidateOverlapInPublicBadges
    +plan.publicBadgeFilmsWithoutCachedCandidates
    ||plan.checkpointStoredCandidateMovieCount!==plan.knownCandidateOverlapInPublicBadges
    +plan.storedCandidatesOutsidePublicBadges
    ||plan.theoreticalSearchCallsForSingleEnvelope>dailyResearchSearchCalls)
    throw Error('YOUTUBE_BOOTSTRAP_FORECAST_ACCOUNTING_INVALID')
  return plan
}
export function bootstrapBudgetMarkdown(p){
  if(p?.kind!==FORECAST_KIND||p.publicationPermitted!==false
    ||p.privateArtifact!==true||p.automaticallyRunSearch!==false
    ||p.availableSearchCallsGuaranteed!==false
    ||p.currentQuotaRemaining!==null||p.currentActualQuotaUsage!==null
    ||p.newYoutubeSearchCalls!==0||p.verifiedGermanOffers!==0
    ||p.confirmedPlaybackRoutes!==0||p.firestoreWrites!==0
    ||p.catalogWrites!==0||p.badgeWrites!==0||p.providerWrites!==0
    ||!Array.isArray(p.scenarios)||p.scenarios.length!==4
    ||!Array.isArray(p.selectedResearchHypotheses)
    ||p.theoreticalSearchCallsForSingleEnvelope>
      p.plannedDailyResearchSearchCalls)
    throw Error('YOUTUBE_BOOTSTRAP_FORECAST_PUBLICATION_NOT_ALLOWED')
  const lines=[
    '# YouTube MovieHub: realer öffentlicher Grundstamm und Suchbudget – nur Prognose',
    '',
    '- Öffentliche DE-Filme mit YouTube-Badge: '+p.publicBadgeMovieCount,
    '- Geschützt gespeicherte globale Film-Kandidaten: '+p.checkpointStoredCandidateMovieCount,
    '- Davon im aktuellen öffentlichen Badge-Bestand: '+p.knownCandidateOverlapInPublicBadges,
    '- Öffentliche Badge-Filme OHNE bisher gespeicherten Video-Kandidaten: '+
      p.publicBadgeFilmsWithoutCachedCandidates,
    '- Bekannte Kandidaten außerhalb öffentlicher YouTube-Badges: '+p.storedCandidatesOutsidePublicBadges,
    '- Planungsbasis: 2 search.list-Aufrufe je bisher unbekanntem Film; bekannte Film-IDs nicht nochmals suchen.',
    '- Konfiguriertes Google-Cloud-Projektlimit: 100 search.list-Aufrufe/Tag; aktuelle tatsächliche Belegung UNBEKANNT.',
    '- Forschungsreserve-Probe für EINEN Tag: '+p.plannedDailyResearchSearchCalls+
      ' Suchaufrufe, maximal '+p.plannedFilmsForSingleResearchEnvelope+
      ' neue Filmhypothesen.',
    '- Queue-Digest (für deterministische Prüfung): '+p.publicQueueIdentity,
    '- Geschützter Cache-Digest: '+p.candidateCheckpointIdentity,
    '- **Keine Suchfreigabe: Kein autonomer Lauf, kein Provider-Write, keine DE-Film-/Fassungs-/Tarifbestätigung.**',
    '',
    '| Forsch.-Suchen/Tag | Für andere Prozesse reserviert | Theoretische Filme/Tag | Untergrenze Such-Tage* |',
    '| ---: | ---: | ---: | ---: |',
    ...p.scenarios.map(s=>'| '+s.researchSearchCallsPerDay+
      ' | '+s.reservedForOtherSearchWorkflows+' | '+s.candidateFilmsPerDay+
      ' | '+s.minimumTheoreticalSearchDays+' |'),
    '',
    '*Reine Suchzeit für derzeit nicht gecachte öffentliche Badge-Filme, zwei Aufrufe je Film, ohne neue Titel, Pausen, Fehler, 429, Freigaben oder Geräteabnahmen. **Kein zugesagter Produktivtermin.**',
    'Die bekannte Film-ID via videos.list neu prüfen; eine solche Detailabfrage benötigt keine search.list-Call-Budget-Einheit.',
    '',
    '### Auszug geplante erste neue öffentliche TMDB-Filme (NICHT ZUM SUCHEN FREIGEGEBEN)',
    '',
    ...p.selectedResearchHypotheses.map(x=>'- '+x.key),
    '',
  ]
  return lines.join('\n')
}
export async function runBootstrapBudgetForecast({
  checkpointPath=GLOBAL_CHECKPOINT_INPUT,output=FORECAST_OUTPUT,
  readIndex=loadPublicMovieHubIndex,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE||typeof readIndex!=='function')
    throw Error('YOUTUBE_BOOTSTRAP_BUDGET_NO_WRITES_REQUIRED')
  const checkpoint=JSON.parse(await readFile(checkpointPath,'utf8'))
  const publicIndex=await readIndex()
  const p=createYoutubeBootstrapBudgetForecast({
    publicIndex,globalCheckpoint:checkpoint,
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/forecast.json',JSON.stringify(p,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',bootstrapBudgetMarkdown(p)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify({
    kind:p.kind,publicBadgeMovies:p.publicBadgeMovieCount,
    sharedCachedMovies:p.checkpointStoredCandidateMovieCount,
    matchedCachedMovies:p.knownCandidateOverlapInPublicBadges,
    missingCachedMovies:p.publicBadgeFilmsWithoutCachedCandidates,
    plannedSearchCallsOneWindow:p.theoreticalSearchCallsForSingleEnvelope,
    scenarios:p.scenarios,
    googleSearchesActuallyMade:0,automaticSearch:false,
    publicationPermitted:false,confirmedPlaybackRoutes:0,
  }))
  return p
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runBootstrapBudgetForecast().catch(e=>{
    console.error('YOUTUBE_BOOTSTRAP_BUDGET_FORECAST_FAILED_CLOSED: '+e.message)
    process.exitCode=1
  })
}
