/**
 * G2 AP1: PRIVATE coverage baseline for BOTH directions, one read-only QA.
 * Track A: pinned FREE/R&B YouTube source videos -> canonical TMDB films.
 * Track B: existing MovieHub/TMDB YouTube provider badges -> exact video routes.
 *
 * Never equate editorial playlist links with independently verified DE offers.
 * Account-only title membership stays in the inventory; this report emits
 * aggregate counts, never private titles, profile IDs or source references.
 */
import {createYoutubeFullCatalogResearchPlan} from './youtube-g2-full-catalog-queue.mjs'
import {YOUTUBE_VERIFIED_ROUTE_INDEX_KIND} from '../src/providers/youtubeVerifiedRouteIndex.js'
import {CURATED_HINT_KIND} from '../src/providers/youtubeCuratedEditorialIndex.js'
import {YOUTUBE_SEARCH_TITLES_KIND} from './youtube-g2-publish-search-title-companion.mjs'
import {G2_REVIEW_KIND} from './youtube-g2-actionable-review-queue.mjs'

export const BIDIRECTIONAL_BASELINE_KIND='moviehub-youtube-g2-bidirectional-coverage-baseline'
const keyOf=x=>{
  const type=x?.type==='movie'||x?.type==='series'?x.type:null
  const id=Number(x?.tmdbId)
  return type&&Number.isInteger(id)&&id>0?type+':'+id:null
}
const badge=x=>Array.isArray(x?.providerIds)&&x.providerIds.includes('youtube')
  ||Array.isArray(x?.providerOffers)&&x.providerOffers.some(y=>y?.id==='youtube')
const sum=x=>Object.values(x||{}).reduce((a,b)=>a+Number(b||0),0)
const validDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))

export function buildYoutubeG2BidirectionalCoverage({
  inventory,publicIndex,reviewQueue,editorialIndex,searchTitleFeed,
  verifiedRoutes,now=new Date().toISOString(),
}={}){
  // The production-tested full-account inventory guard rejects fallback,
  // stale, partial and fabricated public/canonical inputs.
  const plan=createYoutubeFullCatalogResearchPlan({
    inventory,publicIndex,offset:0,limit:1,now,
  })
  const validTime=Date.parse(now)
  if(!validDate(now)||!Number.isFinite(validTime)
    ||reviewQueue?.kind!==G2_REVIEW_KIND
    ||reviewQueue.privateArtifact!==true
    ||reviewQueue.publicationPermitted!==false
    ||!Array.isArray(reviewQueue.items)
    ||reviewQueue.items.length!==reviewQueue.sourceVideoIds
    ||reviewQueue.accountedForVideos!==reviewQueue.sourceVideoIds
    ||reviewQueue.missingVideos!==0
    ||!Number.isInteger(reviewQueue.pendingReview)
    ||reviewQueue.pendingReview<0
    ||reviewQueue.publishedPlaylistLinks+reviewQueue.pendingReview!==reviewQueue.sourceVideoIds
    ||sum(reviewQueue.declaredClasses)!==reviewQueue.sourceVideoIds
    ||sum(reviewQueue.lanes)!==reviewQueue.pendingReview
    ||reviewQueue.independentVerifiedDEOffers!==0
    ||reviewQueue.newUnverifiedDatabaseWrites!==0
    ||!validDate(reviewQueue.generatedAt)
    ||validTime-Date.parse(reviewQueue.generatedAt)>12*3600000
    ||Date.parse(reviewQueue.generatedAt)>validTime+60000
    ||editorialIndex?.kind!==CURATED_HINT_KIND
    ||editorialIndex.providerId!=='youtube'
    ||editorialIndex.publicationAuthority!=='editorial-playlist-only'
    ||editorialIndex.sourceVideoIds!==reviewQueue.sourceVideoIds
    ||editorialIndex.verifiedDEOffers!==0
    ||editorialIndex.verifiedPlaybackRoutes!==0
    ||!Array.isArray(editorialIndex.entries)
    ||editorialIndex.count!==editorialIndex.entries.length
    ||editorialIndex.count!==reviewQueue.publishedPlaylistLinks
    ||searchTitleFeed?.kind!==YOUTUBE_SEARCH_TITLES_KIND
    ||searchTitleFeed.providerId!=='youtube'
    ||searchTitleFeed.sourceVideoIds!==reviewQueue.sourceVideoIds
    ||searchTitleFeed.offerVerification!=='editorial-only-not-independent'
    ||!Array.isArray(searchTitleFeed.entries)
    ||searchTitleFeed.count!==searchTitleFeed.entries.length
    ||searchTitleFeed.count!==editorialIndex.count
    ||verifiedRoutes?.kind!==YOUTUBE_VERIFIED_ROUTE_INDEX_KIND
    ||verifiedRoutes.providerId!=='youtube'
    ||!Array.isArray(verifiedRoutes.entries)
    ||verifiedRoutes.count!==verifiedRoutes.entries.length
    ||!validDate(editorialIndex.generatedAt)
    ||!validDate(searchTitleFeed.generatedAt)
    ||!validDate(verifiedRoutes.generatedAt)
    ||editorialIndex.generatedAt!==searchTitleFeed.generatedAt){
    throw Error('YOUTUBE_G2_BIDIRECTIONAL_INPUTS_MISSING_OR_UNTRUSTED')
  }

  const seenVideos=new Set()
  const playlistKeys=new Set()
  const playlistVideoIds=new Set()
  for(const e of editorialIndex.entries){
    const id=Number(e?.tmdbId),k='movie:'+id
    if(!Number.isInteger(id)||id<=0||e.key!==k
      ||!(/^[A-Za-z0-9_-]{11}$/).test(String(e.videoId||''))
      ||e.watchUrl!=='https://www.youtube.com/watch?v='+e.videoId
      ||e.mediaType!=='movie'
      ||!['free','rent-buy'].includes(e.playlistMode)
      ||e.verificationStatus!=='not-independently-verified'
      ||playlistKeys.has(k)||playlistVideoIds.has(e.videoId))
      throw Error('YOUTUBE_G2_BIDIRECTIONAL_EDITORIAL_KEYS_INVALID')
    playlistKeys.add(k);playlistVideoIds.add(e.videoId)
  }
  const searchKeys=new Set()
  for(const e of searchTitleFeed.entries){
    const id=Number(e?.tmdbId),k='movie:'+id
    if(!Number.isInteger(id)||id<=0||!playlistKeys.has(k)
      ||searchKeys.has(k)
      ||e.film?.type!=='movie'||e.film?.tmdbId!==id
      ||e.film?.id!=='tmdb-movie-'+id
      ||!e.film.title||e.film.source!=='tmdb'
      ||e.film.verifiedTitleOffers||e.film.curatedPlaylistTitleOffer)
      throw Error('YOUTUBE_G2_BIDIRECTIONAL_SEARCH_COVERAGE_INVALID')
    searchKeys.add(k)
  }
  if(searchKeys.size!==playlistKeys.size)
    throw Error('YOUTUBE_G2_BIDIRECTIONAL_SEARCH_KEYS_MISSING')
  let publishedInReview=0
  for(const e of reviewQueue.items){
    if(!(/^[A-Za-z0-9_-]{11}$/).test(String(e?.videoId||''))
      ||seenVideos.has(e.videoId)
      ||!['FREE','R&B'].includes(e.playlistClass))
      throw Error('YOUTUBE_G2_BIDIRECTIONAL_REVIEW_VIDEO_INVALID')
    seenVideos.add(e.videoId)
    const actual=playlistVideoIds.has(e.videoId)
    if((e.publicationStatus==='playlist-link-published')!==actual)
      throw Error('YOUTUBE_G2_BIDIRECTIONAL_REVIEW_PUBLICATION_MISMATCH')
    if(actual)publishedInReview++
  }
  if(publishedInReview!==playlistVideoIds.size)
    throw Error('YOUTUBE_G2_BIDIRECTIONAL_REVIEW_COVERAGE_INVALID')
  const publicBadges=new Map()
  for(const e of publicIndex.entries){
    const k=keyOf(e)
    if(!k||!badge(e))continue
    publicBadges.set(k,true)
  }
  const publicMovies=[...publicBadges.keys()].filter(k=>k.startsWith('movie:'))
  const publicSeries=[...publicBadges.keys()].filter(k=>k.startsWith('series:'))
  const verifiedKeys=new Set()
  for(const e of verifiedRoutes.entries){
    if(e?.key!=='movie:'+Number(e.tmdbId)
      &&e?.key!=='series:'+Number(e.tmdbId))
      throw Error('YOUTUBE_G2_BIDIRECTIONAL_VERIFIED_KEY_INVALID')
    if(verifiedKeys.has(e.key))throw Error('YOUTUBE_G2_BIDIRECTIONAL_VERIFIED_DUPLICATE')
    verifiedKeys.add(e.key)
  }
  const movieWithEditorial=publicMovies.filter(k=>playlistKeys.has(k)).length
  const movieWithVerified=publicMovies.filter(k=>verifiedKeys.has(k)).length
  const movieWithExact=publicMovies.filter(k=>playlistKeys.has(k)||verifiedKeys.has(k)).length
  const seriesWithVerified=publicSeries.filter(k=>verifiedKeys.has(k)).length
  if(plan.basis.publicYoutubeBadgedMovies!==publicMovies.length
    ||plan.basis.publicYoutubeBadgedSeriesDeferred!==publicSeries.length)
    throw Error('YOUTUBE_G2_BIDIRECTIONAL_TMDb_FIRST_BADGE_COUNT_MISMATCH')

  return {
    kind:BIDIRECTIONAL_BASELINE_KIND,schemaVersion:1,
    generatedAt:new Date(now).toISOString(),
    privateArtifact:true,publicationPermitted:false,
    publicIndexObservedAt:publicIndex.generatedAt,
    canonicalInventoryObservedAt:inventory.generatedAt,
    playlistReviewObservedAt:reviewQueue.generatedAt,
    // YouTube-first and TMDB-first are disjoint PROCESSES, not disjoint movies.
    youtubeFirst:{
      sourceVideos:reviewQueue.sourceVideoIds,
      freeVideos:reviewQueue.declaredClasses.FREE||0,
      rentBuyVideos:reviewQueue.declaredClasses['R&B']||0,
      editorialDirectLinks:playlistKeys.size,
      newTmdbFilmMetadata:reviewQueue.newCanonicalMovies,
      stableSearchTitles:searchKeys.size,
      reviewOnlyVideos:reviewQueue.pendingReview,
      reviewLanes:{...reviewQueue.lanes},
    },
    tmdbFirst:{
      publicYoutubeBadgedMovies:publicMovies.length,
      publicYoutubeBadgedSeries:publicSeries.length,
      canonicalAndPublicMovieBadges:plan.basis.canonicalAndPublicBadgedTitles,
      publicSearchOnlyMovieBadges:plan.basis.publicSearchOnlyBadgedTitles,
      privateOnlyYoutubeOfferCoverage:'unknown-not-in-public-search-index',
      movieBadgesWithCuratedPlaylistLinks:movieWithEditorial,
      movieBadgesWithIndependentlyVerifiedRoutes:movieWithVerified,
      movieBadgesWithAnyExactRoute:movieWithExact,
      movieBadgesStillUsingSearchFallback:publicMovies.length-movieWithExact,
      seriesBadgesWithIndependentlyVerifiedRoutes:seriesWithVerified,
      seriesBadgesRequiringEpisodeOrSeriesReview:publicSeries.length-seriesWithVerified,
    },
    totalVerifiedDETitleRoutes:verifiedKeys.size,
    independentlyVerifiedOffersNotImpliedByEditorialLinks:true,
    status:'read-only-coverage-no-offer-or-match-approval',
    publicRecordsExported:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
    nightlyWrites:0,
  }
}

export function renderYoutubeG2BidirectionalCoverage(report){
  if(report?.kind!==BIDIRECTIONAL_BASELINE_KIND
    ||report.privateArtifact!==true||report.publicationPermitted!==false)
    throw Error('YOUTUBE_G2_BIDIRECTIONAL_RENDER_INVALID')
  const y=report.youtubeFirst,t=report.tmdbFirst
  return [
    '# YouTube G2 – bidirectional coverage baseline (PRIVATE / read-only)',
    '',
    '- YouTube-first: '+y.sourceVideos+' source videos ('+y.freeVideos+' FREE, '+y.rentBuyVideos+' R&B)',
    '- Exact editorial playlist video links: '+y.editorialDirectLinks,
    '- Stable searchable TMDB playlist films: '+y.stableSearchTitles,
    '- Currently new TMDB film metadata: '+y.newTmdbFilmMetadata,
    '- Playlist videos pending review: '+y.reviewOnlyVideos,
    '- TMDB-first: '+t.publicYoutubeBadgedMovies+' existing PUBLIC YouTube movie badges',
    '- Existing PUBLIC YouTube series badges: '+t.publicYoutubeBadgedSeries,
    '- TMDB-first exact links FROM playlist overlap: '+t.movieBadgesWithCuratedPlaylistLinks,
    '- TMDB-first independently verified direct routes: '+t.movieBadgesWithIndependentlyVerifiedRoutes,
    '- TMDB-first PUBLIC movies without exact links (search fallback): '+t.movieBadgesStillUsingSearchFallback,
    '- TMDB-first canonical+public vs public-only: '
      +t.canonicalAndPublicMovieBadges+' / '+t.publicSearchOnlyMovieBadges,
    '- Private-only YouTube offer membership: UNKNOWN (not claimed absent).',
    '- Verified DE routes never inferred from editorial classes.',
    '- TMDB-first films and YouTube-first source videos are different denominators.',
    '- All raw profile/account references stay outside this report.',
    '- 0 API searches, 0 publication/offer/catalog/Firestore writes.',
    '',
  ].join('\n')
}
