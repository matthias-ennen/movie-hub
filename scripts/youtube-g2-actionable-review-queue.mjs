/**
 * Lossless, PRIVATE YouTube G2 review list.
 * All 86+ playlist IDs are accounted for: published editorial links and
 * unresolved exact videos have separate lanes. This tool does NOT assign
 * identity, playback permission, provider availability, or writes to MovieHub.
 */
import {hasDominantFilmHypothesis} from '../src/providers/youtubeCuratedEditorialIndex.js'

export const G2_REVIEW_KIND='moviehub-youtube-g2-actionable-review-queue'
export const G2_REVIEW_VERSION=1
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const isDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const counts=(items,fn)=>Object.fromEntries([...new Set(items.map(fn))].sort()
  .map(key=>[key,items.filter(x=>fn(x)===key).length]))
const noSourceWrites=x=>['catalogWrites','firestoreWrites','badgeWrites','providerWrites','nightlyWrites']
  .every(key=>x?.[key]===0)
function verify(intake,research,reconciliation,hints,filmFeed,now){
  const nowMs=Date.parse(now)
  if(!isDate(now)||!isDate(intake?.generatedAt)||!isDate(research?.summary?.generatedAt)
    ||!isDate(reconciliation?.generatedAt)||!isDate(hints?.generatedAt)
    ||!isDate(filmFeed?.generatedAt)
    ||nowMs-Date.parse(intake.generatedAt)>12*3600000
    ||nowMs-Date.parse(intake.generatedAt)<-60000
    ||nowMs-Date.parse(reconciliation.generatedAt)>12*3600000
    ||nowMs-Date.parse(reconciliation.generatedAt)<-60000
    ||nowMs-Date.parse(hints.generatedAt)>12*3600000
    ||nowMs-Date.parse(hints.generatedAt)<-60000
    ||filmFeed.generatedAt!==hints.generatedAt
    ||intake?.mode!=='YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY'
    ||intake.fullScan!==true||intake.publicationPermitted!==false
    ||reconciliation?.kind!=='moviehub-youtube-full-catalog-reconciliation'
    ||reconciliation.privateArtifact!==true||reconciliation.publicationPermitted!==false
    ||research?.summary?.mode!=='CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
    ||research.summary.publicationPermitted!==false
    ||intake.sourceQAObservedAt!==research.summary.sourceQAObservedAt
    ||intake.researchObservedAt!==research.summary.generatedAt
    ||reconciliation.sourceObservedAt!==intake.sourceQAObservedAt
    ||hints?.kind!=='moviehub-youtube-curated-editorial-title-hints'
    ||hints.providerId!=='youtube'||hints.publicationAuthority!=='editorial-playlist-only'
    ||hints.verifiedDEOffers!==0||hints.verifiedPlaybackRoutes!==0
    ||filmFeed?.kind!=='moviehub-youtube-curated-new-film-metadata'
    ||filmFeed.providerId!=='youtube'
    ||filmFeed.offerVerification!=='editorial-only-not-independent'
    ||!Array.isArray(intake.items)||!Array.isArray(research.rows)
    ||!Array.isArray(reconciliation.entries)
    ||!Array.isArray(hints.entries)||!Array.isArray(filmFeed.entries)
    ||!Number.isInteger(intake.uniqueVideoIds)||intake.uniqueVideoIds<1
    ||intake.processedVideoIds!==intake.uniqueVideoIds
    ||intake.unaccountedForVideoIds!==0
    ||reconciliation.totalVideoIds!==intake.uniqueVideoIds
    ||reconciliation.processedVideoIds!==intake.uniqueVideoIds
    ||reconciliation.unaccountedForVideoIds!==0
    ||research.summary.sourceVideoIds!==intake.uniqueVideoIds
    ||research.summary.processedRows!==intake.uniqueVideoIds
    ||hints.sourceVideoIds!==intake.uniqueVideoIds
    ||filmFeed.sourceVideoIds!==intake.uniqueVideoIds
    ||[intake.items,research.rows,reconciliation.entries].some(xs=>
      xs.length!==intake.uniqueVideoIds
      ||new Set(xs.map(x=>x.videoId)).size!==intake.uniqueVideoIds
      ||xs.some(x=>!VIDEO.test(String(x?.videoId||''))))
    ||hints.entries.length!==hints.count
    ||filmFeed.entries.length!==filmFeed.count
    ||new Set(hints.entries.map(x=>x.videoId)).size!==hints.count
    ||new Set(hints.entries.map(x=>x.key)).size!==hints.count
    ||filmFeed.count>hints.count
    ||hints.count>intake.uniqueVideoIds
    ||!noSourceWrites(intake)||!noSourceWrites(research.summary)
    ||!noSourceWrites(reconciliation)
    ||reconciliation.verifiedDEOffers!==0||reconciliation.newMoviesImported!==0
    ||intake.independentlyVerifiedDEOffers!==0) {
    throw Error('YOUTUBE_REVIEW_QUEUE_INPUT_NOT_CURRENT_OR_NOT_TRUSTED')
  }
}
function laneFor(item,research,rec,{competingVideoIds=[]}={}){
  const verdict=research?.matchStatus
  // A rejected, *known* source must not be misreported as missing metadata.
  // Both cases are still pending, but require DIFFERENT next steps.
  if(item.regionSignal==='excluded')return {
    lane:'region-excluded',priority:3,
    nextAction:'DE is excluded in YouTube source metadata; keep unlinked and recheck only after source-region changes.'}
  if(item.sourceScreened===false&&item.sourceTitle
    &&Number.isFinite(item.durationMinutes)&&item.durationMinutes>0
    &&item.durationMinutes<30)return {
      lane:'short-video-not-full-film',priority:3,
      nextAction:'Source duration is too short for a full film; do not turn a trailer/clip into a MovieHub movie link.'}
  if(!item.sourceScreened||!item.sourceTitle
    ||verdict==='review-no-eligible-video-details')return {
      lane:'missing-video-metadata',priority:2,
      nextAction:'Check private/deleted/unavailable video and retry YouTube metadata; never guess film identity.'}
  if(competingVideoIds.length)return {
    lane:'competing-video-routes',priority:1,
    nextAction:'Two strong video candidates propose the same TMDB film; inspect both exact versions and DE playback, then choose a route explicitly. FREE preference is not independent evidence.'}
  if(research?.identityRisk||verdict==='review-explicit-source-or-cut-risk'
    ||verdict==='review-work-or-cut-runtime-conflict')return {
      lane:'edition-or-source-conflict',priority:2,
      nextAction:'Compare exact cut, actual runtime and provenance against TMDB; do not treat a similar title as the film.'}
  if(verdict==='review-current-release-needs-content-check')return {
    lane:'new-release-content-check',priority:3,
      nextAction:'Verify trailer/storefront versus actual full film and release date before linking.'}
  if(verdict==='review-leading-movie-with-TV-alternatives')return {
    lane:'movie-versus-series',priority:2,
      nextAction:'Compare movie and TV identities; verify exact work and cut before accepting this TMDB ID.'}
  if(verdict==='review-multiple-film-works'
    ||verdict==='review-explicit-year-conflict'
    ||verdict==='review-weak-title'
    ||verdict==='review-short-ambiguous-title')return {
      lane:'ambiguous-work-identity',priority:2,
      nextAction:'Disambiguate year, cast, franchise part and actual runtime; keep proposed IDs review-only.'}
  if(rec?.completeCatalogMembership==='canonical-existing')return {
    lane:'existing-movie-needs-identity-proof',priority:1,
      nextAction:'Review leading and runner-up films, then link exact video to existing movie:TMDB ID if unambiguous.'}
  if(rec?.completeCatalogMembership==='search-index-only')return {
    lane:'search-only-needs-identity-proof',priority:1,
      nextAction:'Confirm film identity for search-only TMDB title, then use existing canonical import path (no duplicate).'}
  if(rec?.decision==='work-identity-unresolved')return {
    lane:'unresolved-title',priority:3,
      nextAction:'Resolve source work identity before any TMDB film import or provider badge.'}
  return {lane:'matcher-needs-review',priority:2,
    nextAction:'Review exact work, year and runtime against TMDB candidates; no automatic import.'}
}
export function buildYoutubeActionableReviewQueue({
  intake,research,reconciliation,hints,filmFeed,
  now=new Date().toISOString(),
}={}){
  verify(intake,research,reconciliation,hints,filmFeed,now)
  const researched=new Map(research.rows.map(x=>[x.videoId,x]))
  const reconciled=new Map(reconciliation.entries.map(x=>[x.videoId,x]))
  const published=new Map(hints.entries.map(x=>[x.videoId,x]))
  const publishedFilms=new Map(filmFeed.entries.map(x=>[x.videoId,x]))
  // Diagnose cross-playlist film duplicates WITHOUT resolving them automatically.
  // Competing full-film videos remain unlinked even when both score strongly.
  const byFilm=new Map()
  for(const item of intake.items){
    const key=item.suggestedFilmRef?.mediaType==='movie'
      &&Number.isInteger(item.suggestedFilmRef.tmdbId)
      &&item.suggestedFilmRef.tmdbId>0
      ?'movie:'+item.suggestedFilmRef.tmdbId:null
    if(key)byFilm.set(key,[...(byFilm.get(key)||[]),item])
  }
  const competing=new Map()
  for(const [key,items] of byFilm){
    if(items.length!==2||items[0].videoId===items[1].videoId)continue
    const strong=items.every(item=>{
      const row=researched.get(item.videoId)
      const rec=reconciled.get(item.videoId)
      const top=row?.topCandidates?.[0]
      return !published.has(item.videoId)
        &&row?.matchStatus==='review-leading-film-hypothesis'
        &&row.identityRisk===null
        &&Array.isArray(row.errors)&&row.errors.length===0
        &&Array.isArray(row.alternativeTvIds)&&row.alternativeTvIds.length===0
        &&Array.isArray(row.topCandidates)
        &&(row.topCandidates.length===1
          ||hasDominantFilmHypothesis(row.topCandidates))
        &&top?.tmdbId===item.suggestedFilmRef.tmdbId
        &&top.titleLevel===4&&top.score>=38
        &&Number.isFinite(top.runtimeDelta)&&top.runtimeDelta<=10
        &&item.sourceScreened===true&&Boolean(item.sourceTitle)
        &&item.regionSignal!=='excluded'
        &&Number.isFinite(item.durationMinutes)&&item.durationMinutes>=60
        &&rec?.suggestedFilmKey===key
    })
    if(!strong||Math.abs(items[0].durationMinutes-items[1].durationMinutes)>3)continue
    competing.set(items[0].videoId,[items[1].videoId])
    competing.set(items[1].videoId,[items[0].videoId])
  }
  for(const film of filmFeed.entries){
    const hint=published.get(film.videoId)
    if(!VIDEO.test(String(film.videoId||''))
      ||!Number.isInteger(film.tmdbId)||film.tmdbId<=0
      ||hint?.key!=='movie:'+film.tmdbId
      ||hint.playlistMode!==(film.playlistClass==='FREE'?'free':'rent-buy')
      ||film.film?.tmdbId!==film.tmdbId||film.film?.type!=='movie'
      ||film.film?.source!=='tmdb')throw Error('YOUTUBE_REVIEW_QUEUE_PUBLISHED_FILM_NOT_MATCHED')
  }
  const all=intake.items.map(item=>{
    const r=researched.get(item.videoId)
    const rec=reconciled.get(item.videoId)
    const hint=published.get(item.videoId)
    if(!r||!rec
      ||rec.playlistClass!==item.playlistClass
      ||r.editorialOfferHint!==(item.playlistClass==='FREE'?'free':'rent-buy')
      ||r.matchStatus!==item.identityResearchStatus
      ||rec.suggestedFilmKey!==(item.suggestedFilmRef
        ?'movie:'+item.suggestedFilmRef.tmdbId:null)
      ||(hint&&(
        hint.playlistMode!==(item.playlistClass==='FREE'?'free':'rent-buy')
        ||hint.videoId!==item.videoId
        ||hint.key!==rec.suggestedFilmKey
        ||hint.watchUrl!=='https://www.youtube.com/watch?v='+item.videoId))){
      throw Error('YOUTUBE_REVIEW_QUEUE_SOURCE_MATCH_MISMATCH')
    }
    const action=hint
      ?{lane:publishedFilms.has(item.videoId)?'new-movie-published':'existing-movie-linked',
        priority:0,nextAction:'Playlist link published; independent DE playback/edition still separate.'}
      :laneFor(item,r,rec,{competingVideoIds:competing.get(item.videoId)||[]})
    return {
      videoId:item.videoId,playlistClass:item.playlistClass,
      title:item.sourceTitle||null,channel:item.channelTitle||null,
      url:'https://www.youtube.com/watch?v='+item.videoId,
      suggestedTmdbId:item.suggestedFilmRef?.tmdbId||null,
      publicMembership:item.publicCatalogMembership,
      completeCatalogMembership:rec.completeCatalogMembership,
      matcherStatus:r.matchStatus,
      tmdbAlternatives:(Array.isArray(r.topCandidates)?r.topCandidates:[]).slice(0,3)
        .map(c=>({tmdbId:c.tmdbId,score:c.score,titleLevel:c.titleLevel,
          runtimeDelta:c.runtimeDelta})),
      publicationStatus:hint?'playlist-link-published':'review-only',
      sourceVerifiedDEOffer:false,
      competingVideoIds:competing.get(item.videoId)||[],
      ...action,
    }
  })
  const publishedRows=all.filter(x=>x.publicationStatus==='playlist-link-published')
  const openRows=all.filter(x=>x.publicationStatus==='review-only')
    .sort((a,b)=>a.priority-b.priority
      ||a.lane.localeCompare(b.lane)
      ||a.videoId.localeCompare(b.videoId))
  const out={
    kind:G2_REVIEW_KIND,schemaVersion:G2_REVIEW_VERSION,
    generatedAt:now,sourceVideoIds:intake.uniqueVideoIds,
    accountedForVideos:all.length,missingVideos:intake.uniqueVideoIds-all.length,
    declaredClasses:counts(all,x=>x.playlistClass),
    publishedPlaylistLinks:publishedRows.length,newCanonicalMovies:publishedFilms.size,
    pendingReview:openRows.length,
    lanes:counts(openRows,x=>x.lane),
    independentVerifiedDEOffers:0,newUnverifiedDatabaseWrites:0,
    publicationPermitted:false,privateArtifact:true,
    items:all,prioritizedReview:openRows,
  }
  if(out.missingVideos!==0||out.publishedPlaylistLinks!==hints.count
    ||out.newCanonicalMovies!==filmFeed.count
    ||out.pendingReview+out.publishedPlaylistLinks!==intake.uniqueVideoIds){
    throw Error('YOUTUBE_REVIEW_QUEUE_COVERAGE_MISMATCH')
  }
  return out
}
export function renderYoutubeActionableReviewQueue(r){
  if(r?.kind!==G2_REVIEW_KIND||r.missingVideos!==0
    ||!r.privateArtifact||r.publicationPermitted!==false){
    throw Error('YOUTUBE_REVIEW_QUEUE_REPORT_NOT_TRUSTED')
  }
  const head=[
    '# MovieHub YouTube G2 – PRIORITIZED review of unresolved playlist videos',
    '',
    '- Read-only source video IDs: '+r.sourceVideoIds,
    '- 1:1 accounted: '+r.accountedForVideos+'; missing '+r.missingVideos,
    '- Editorial exact YouTube links: '+r.publishedPlaylistLinks,
    '- New canonical TMDB movies already published: '+r.newCanonicalMovies,
    '- Video IDs pending identity/metadata/cut review: '+r.pendingReview,
    '- FREE/R&B: '+JSON.stringify(r.declaredClasses),
    '- Pending review lanes: '+JSON.stringify(r.lanes),
    '- No claims of independently verified Germany availability or source usage rights.',
    '- Private QA artifact: may reflect account-specific catalog membership.',
    '',
    '| Priority | Video ID | Source title | Playlist | Proposed TMDB IDs | Competing video IDs | Reason | Next action |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  const clean=value=>String(value??'—').replace(/[\r\n|<>]/g,' ').trim()
  return head.concat(r.prioritizedReview.map(x=>'| P'+x.priority
    +' | '+x.videoId+' | '+clean(x.title)
    +' | '+x.playlistClass+' | '+(x.tmdbAlternatives.map(y=>y.tmdbId).join(', ')||'—')
    +' | '+(x.competingVideoIds.join(', ')||'—')
    +' | '+x.lane+' | '+clean(x.nextAction)+' |'),'').join('\n')
}
