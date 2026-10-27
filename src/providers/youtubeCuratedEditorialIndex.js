/**
 * YouTube G2: user-defined FREE / Rent & Buy playlist declarations.
 *
 * This is an editorial CANDIDATE index, not canonical Availability, a verified
 * provider offer, or proof of playback/content/rights/DE tariff.
 * MovieHub may show it only as a clearly provisional playlist hint.
 */
import {hasExclusiveBilledPairFilmHypothesis} from '../../scripts/youtube-g2-exclusive-pair-evidence.mjs'

import {hasExclusiveReportedYearFilmHypothesis} from '../../scripts/youtube-g2-exclusive-source-year-film.mjs'
import {hasDistantTvNamesakeFeatureFilmEvidence} from '../../scripts/youtube-g2-distant-tv-feature-evidence.mjs'
import {hasExclusiveDirectorFeatureFilmEvidence} from '../../scripts/youtube-g2-exclusive-director-evidence.mjs'

export const CURATED_HINT_KIND='moviehub-youtube-curated-editorial-title-hints'
export const CURATED_HINT_VERSION=1
export const CURATED_HINT_MAX_AGE_MS=7*86400000
const VID=/^[A-Za-z0-9_-]{11}$/
const GOOD_STATUS='review-leading-film-hypothesis'
const MOVIE_PLAYLIST_WITH_TV_SEARCH_HITS='review-leading-movie-with-TV-alternatives'
/**
 * TMDB search returns at most three movie candidates in the G2 review.
 * A first film can be clear even when TWO unrelated weak side-results appear.
 * Accept 2 or 3 only when the first is exact-title / close-runtime and EVERY
 * alternate has an inferior title level and trails by at least 20 points.
 * Two tightly bounded exceptions for SAME-title side hits: an explicitly
 * contradictory source year and cut, or a wildly different runtime plus an
 * affirmative actor identity for the winner. Do NOT accept same-year remakes,
 * close runtimes, plausible near-ties, or any TV alternatives.
 */
export function hasDominantFilmHypothesis(results){
  if(!Array.isArray(results)||(results.length!==2&&results.length!==3))return false
  const [winner,...runners]=results
  return Number.isFinite(winner?.score)&&winner.score>=38
    &&winner.titleLevel===4
    &&Number.isFinite(winner.runtimeDelta)&&winner.runtimeDelta>=0
    &&winner.runtimeDelta<=10
    &&winner.yearMismatch!==true&&winner.sequelConflict!==true
    &&Number.isInteger(Number(winner.tmdbId))&&Number(winner.tmdbId)>0
    &&runners.every(runner=>{
      if(!Number.isFinite(runner?.score)
        ||!Number.isFinite(runner?.titleLevel)
        ||winner.score-runner.score<20
        ||!Number.isInteger(Number(runner?.tmdbId))
        ||Number(runner.tmdbId)<=0
        ||Number(winner.tmdbId)===Number(runner.tmdbId))return false
      if(runner.titleLevel<=2)return true
      if(runner.titleLevel!==4)return false
      // A source video explicitly dated 1978/1993 is not the later remake.
      // Also require a clear duration disagreement, not only a year signal.
      if(runner.yearMismatch===true
        &&winner.score>=40&&winner.runtimeDelta<=5
        &&Number.isFinite(runner.runtimeDelta)
        &&runner.runtimeDelta>=15)return true
      // A same-title result with a completely different duration remains
      // inferior only if independent cast evidence supports the winner.
      return winner.score>=50&&winner.runtimeDelta<=5
        &&winner.quotedActorCreditMatches===true
        &&runner.quotedActorCreditMatches===false
        &&winner.score-runner.score>=40
        &&Number.isFinite(runner.runtimeDelta)
        &&runner.runtimeDelta>=60
    })
}
/**
 * Explicit actor named IN the source playlist title, independently checked
 * against the TMDB credits of every proposed movie, can disambiguate
 * similarly named films even if their runtimes overlap.
 *
 * This is separate from the historical duration/cast dominant gate:
 * no relaxations to hasDominantFilmHypothesis or ordinary movies.
 */
export function hasExclusiveSourceActorFilmHypothesis(results, castEvidence) {
  if(!Array.isArray(results)||(results.length!==2&&results.length!==3))return false
  const [winner,...runners]=results
  if(!Number.isInteger(Number(winner?.tmdbId))||Number(winner.tmdbId)<=0
    ||!Number.isFinite(winner.score)||winner.score<50
    ||winner.titleLevel!==4||!Number.isFinite(winner.runtimeDelta)
    ||winner.runtimeDelta<0||winner.runtimeDelta>5
    ||winner.yearMismatch===true||winner.sequelConflict===true
    ||winner.quotedActorCreditMatches!==true
    ||castEvidence?.actorCreditEvidence!=='matched-a-tmdb-credit-list'
    ||typeof castEvidence.explicitActor!=='string'
    ||!/^\S+\s+\S+/.test(castEvidence.explicitActor)
    ||!Array.isArray(castEvidence.creditedMovieIds)
    ||castEvidence.creditedMovieIds.length!==1
    ||Number(castEvidence.creditedMovieIds[0])!==Number(winner.tmdbId))return false
  const seen=new Set([Number(winner.tmdbId)])
  return runners.every(runner=>{
    const id=Number(runner?.tmdbId)
    if(!Number.isInteger(id)||id<=0||seen.has(id))return false
    seen.add(id)
    return Number.isFinite(runner.score)
      &&Number.isFinite(runner.titleLevel)
      &&runner.quotedActorCreditMatches===false
      &&winner.score-runner.score>=25
  })
}
const ALLOWED=new Set(['free','rent-buy'])
const NO_WRITE=['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
const validDate=v=>Number.isFinite(Date.parse(v))
const key=(type,id)=>type==='movie'&&Number.isInteger(Number(id))&&Number(id)>0
  ?'movie:'+Number(id):null
const preferred=modes=>modes.includes('free')?'free':modes.includes('rent-buy')?'rent-buy':null
const watch=id=>'https://www.youtube.com/watch?v='+id
const empty=(generatedAt,sourceVideoIds=0)=>({
  kind:CURATED_HINT_KIND,schemaVersion:CURATED_HINT_VERSION,
  providerId:'youtube',generatedAt,
  sourceVideoIds,publicationAuthority:'editorial-playlist-only',
  verifiedDEOffers:0,verifiedPlaybackRoutes:0,
  count:0,entries:[],
  classificationCounts:{free:0,'rent-buy':0},
  skippedAmbiguousMovieKeys:0,
})
function validInput(audit,research,now){
  const s=research?.summary
  return Number.isFinite(Date.parse(now))&&validDate(audit?.observedAt)
    &&validDate(s?.generatedAt)&&s.sourceQAObservedAt===audit.observedAt
    &&Date.parse(s.generatedAt)>=Date.parse(audit.observedAt)
    &&Date.parse(now)>=Date.parse(s.generatedAt)-60000
    &&Date.parse(now)-Date.parse(audit.observedAt)<=CURATED_HINT_MAX_AGE_MS
    &&audit.mode==='CURATED_TWO_PLAYLISTS_READ_ONLY'
    &&audit.fullyScanned===true&&audit.publicationPermitted===false
    &&s.mode==='CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
    &&s.publicationPermitted===false&&s.publicIndexOnly===true
    &&s.verifiedFilms===0&&s.verifiedDEOffers===0&&s.newMovieImports===0
    &&NO_WRITE.every(k=>s[k]===0&&audit[k]===0)
    &&Array.isArray(audit.candidates)&&Array.isArray(research.rows)
    &&audit.uniqueVideoIds===audit.candidates.length
    &&s.sourceVideoIds===audit.uniqueVideoIds
    &&s.processedRows===audit.candidates.length
    &&research.rows.length===audit.candidates.length
    &&new Set(audit.candidates.map(c=>c.videoId)).size===audit.candidates.length
    &&new Set(research.rows.map(r=>r.videoId)).size===research.rows.length
    &&audit.candidates.every(c=>VID.test(String(c?.videoId||''))
      &&c.accepted===false&&c.toImport===false
      &&c.playbackRoute===null&&c.verifiedOfferType===null
      &&Array.isArray(c.playlistModes)&&c.playlistModes.length>0
      &&c.playlistModes.every(x=>ALLOWED.has(x))
      &&c.editorialOfferHint===preferred(c.playlistModes))
    &&research.rows.every(r=>r.publicationPermitted===false
      &&r.playbackRoute===null&&r.verifiedOfferType===null
      &&r.verifiedTmdbId===null)
}

export function buildCuratedEditorialTitleIndex(source,research,{
  now=new Date().toISOString(),
}={}){
  const audit=source?.audit??source
  if(!validInput(audit,research,now))throw Error('CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
  const out=empty(new Date(now).toISOString(),audit.uniqueVideoIds)
  const matches=new Map(research.rows.map(r=>[r.videoId,r]))
  const candidates=new Map()
  const conflicts=new Set()
  for(const c of audit.candidates){
    out.classificationCounts[c.editorialOfferHint]++
    const r=matches.get(c.videoId)
    if(!r||r.editorialOfferHint!==c.editorialOfferHint
      ||r.sourceStatus!==c.status
      ||!Array.isArray(r.playlistModes)
      ||r.playlistModes.join(',')!==c.playlistModes.join(',')
      ||!c.screened||!c.videoTitle||!c.channelId
      ||c.deRegionSignal==='excluded'
      ||(r.matchStatus!==GOOD_STATUS
        &&r.matchStatus!==MOVIE_PLAYLIST_WITH_TV_SEARCH_HITS)
      ||r.identityRisk!==null||r.hasPlaylistOfferConflict!==false
      ||r.hasPlaylistOverlap!==(c.playlistModes.length>1)
      ||r.publicIndexMembership!=='public-present'
      // A newly boosted director score cannot bypass the stricter check
      // for near-era/unrelated TV candidates through ordinary film dominance.
      ||(r.matchStatus===MOVIE_PLAYLIST_WITH_TV_SEARCH_HITS
        &&r.directorEvidence?.affectsRanking===true
        &&!hasExclusiveDirectorFeatureFilmEvidence(c.videoTitle,r))
      // This is a user-defined MOVIE playlist. A fuzzy /search/tv result
      // is not a competing FILM when one TMDB movie matches decisively.
      // For ordinary leading-film rows, unexpected TV hits still fail closed.
      ||(r.matchStatus===GOOD_STATUS&&(r.alternativeTvIds||[]).length>0)
      ||(r.matchStatus===MOVIE_PLAYLIST_WITH_TV_SEARCH_HITS
        &&(!Array.isArray(r.alternativeTvIds)||r.alternativeTvIds.length===0
          ||!Array.isArray(c.playlistIds)||c.playlistIds.length===0))
      ||(r.errors||[]).length>0
      ||!Array.isArray(r.topCandidates)
      ||!(r.topCandidates.length===1
        ||hasDominantFilmHypothesis(r.topCandidates)
        ||hasExclusiveSourceActorFilmHypothesis(r.topCandidates,r.castEvidence)
        ||hasExclusiveBilledPairFilmHypothesis(c.videoTitle,r)
        ||hasExclusiveReportedYearFilmHypothesis(c.videoTitle,r)
        ||hasDistantTvNamesakeFeatureFilmEvidence(c.videoTitle,r)
        ||hasExclusiveDirectorFeatureFilmEvidence(c.videoTitle,r)))continue
    const top=r.topCandidates[0]
    const movieKey=key('movie',top.tmdbId)
    if(!movieKey||!Number.isFinite(top.score)||top.score<28
      ||!Number.isFinite(top.titleLevel)||top.titleLevel<3
      ||!Number.isFinite(top.runtimeDelta)||top.runtimeDelta<0||top.runtimeDelta>15
      ||top.yearMismatch===true||top.sequelConflict===true
      // A TV search hit must never rescue an otherwise weak movie match.
      // For this MOVIE-playlist-only batch require an EXACT movie title,
      // near-exact film runtime, and the unchanged dominant-movie gate.
      ||(r.matchStatus===MOVIE_PLAYLIST_WITH_TV_SEARCH_HITS
        &&(top.score<38||top.titleLevel!==4||top.runtimeDelta>5)))continue
    const entry={
      key:movieKey,mediaType:'movie',tmdbId:Number(top.tmdbId),
      videoId:c.videoId,watchUrl:watch(c.videoId),
      playlistMode:c.editorialOfferHint,
      playlistIds:[...c.playlistIds],
      sourceTitle:c.videoTitle,
      channelTitle:c.channelTitle||'',
      deRegionSignal:c.deRegionSignal,
      evidence:'playlist-declared-plus-review-matcher',
      verificationStatus:'not-independently-verified',
    }
    // Do not guess between two competing video IDs for the same movie.
    if(candidates.has(movieKey))conflicts.add(movieKey)
    else candidates.set(movieKey,entry)
  }
  for(const k of conflicts)candidates.delete(k)
  out.skippedAmbiguousMovieKeys=conflicts.size
  out.entries=[...candidates.values()].sort((a,b)=>a.key.localeCompare(b.key))
  out.count=out.entries.length
  return out
}

export function selectCuratedEditorialTitleHint(index,item,{
  now=Date.now(),
}={}){
  if(index?.kind!==CURATED_HINT_KIND||index.schemaVersion!==CURATED_HINT_VERSION
    ||index.providerId!=='youtube'||index.publicationAuthority!=='editorial-playlist-only'
    ||index.verifiedDEOffers!==0||index.verifiedPlaybackRoutes!==0
    ||!Array.isArray(index.entries)||index.count!==index.entries.length
    ||!Number.isFinite(Date.parse(index.generatedAt))
    ||!Number.isFinite(Number(now))
    ||Date.parse(index.generatedAt)>Number(now)+60000
    ||Number(now)-Date.parse(index.generatedAt)>CURATED_HINT_MAX_AGE_MS)return null
  const k=key(item?.type,item?.tmdbId)
  if(!k)return null
  const matched=index.entries.filter(e=>e?.key===k)
  if(matched.length!==1)return null
  const e=matched[0]
  if(e.mediaType!=='movie'||Number(e.tmdbId)!==Number(item.tmdbId)
    ||!VID.test(String(e.videoId||''))||e.watchUrl!==watch(e.videoId)
    ||!ALLOWED.has(e.playlistMode)
    ||e.verificationStatus!=='not-independently-verified'
    ||e.evidence!=='playlist-declared-plus-review-matcher'
    ||!Array.isArray(e.playlistIds)||e.playlistIds.length===0)return null
  return {providerId:'youtube',scope:'title',mode:'APP_DEEP_LINK',
    target:e.watchUrl,videoId:e.videoId,playlistMode:e.playlistMode,
    verificationStatus:'not-independently-verified'}
}
