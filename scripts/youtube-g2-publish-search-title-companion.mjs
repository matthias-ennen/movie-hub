/**
 * Canonical TMDB film metadata to make every published YouTube editorial
 * movie searchable, even after the user marks it as a personal favorite.
 * Public output is TMDB metadata ONLY. No private catalog membership and
 * no independent DE offer verification is carried into the companion.
 */
import { canonicalForIdentity } from './execute-title-priority-queue.mjs'

export const YOUTUBE_SEARCH_TITLES_KIND='moviehub-youtube-curated-search-title-metadata'
export const YOUTUBE_SEARCH_TITLES_OUTPUT='public/youtube-curated-search-titles.json'

export function buildYoutubeCuratedSearchTitleFeed(editorialIndex,canonicalMovies,{
  now=new Date().toISOString(),
}={}){
  if(editorialIndex?.kind!=='moviehub-youtube-curated-editorial-title-hints'
    ||editorialIndex.schemaVersion!==1
    ||editorialIndex.providerId!=='youtube'
    ||editorialIndex.publicationAuthority!=='editorial-playlist-only'
    ||editorialIndex.verifiedDEOffers!==0
    ||editorialIndex.verifiedPlaybackRoutes!==0
    ||!Number.isInteger(editorialIndex.sourceVideoIds)
    ||!Array.isArray(editorialIndex.entries)
    ||editorialIndex.count!==editorialIndex.entries.length
    ||editorialIndex.count>200
    ||!Array.isArray(canonicalMovies)
    ||!Number.isFinite(Date.parse(now)))throw Error('YOUTUBE_SEARCH_COMPANION_INPUT_NOT_TRUSTED')
  const byId=new Map()
  for(const movie of canonicalMovies){
    const tmdbId=Number(movie?.tmdbId)
    if(movie?.type!=='movie'||movie.source!=='tmdb'
      ||!Number.isInteger(tmdbId)||tmdbId<=0
      ||movie.id!=='tmdb-movie-'+tmdbId
      ||!movie.title||!movie.description||!movie.posterUrl
      ||movie.metadataComplete!==true
      ||movie.verifiedTitleOffers||movie.curatedPlaylistTitleOffer
      ||movie.liveAvailability||byId.has(tmdbId)){
      throw Error('YOUTUBE_SEARCH_COMPANION_CANONICAL_INVALID')
    }
    byId.set(tmdbId,movie)
  }
  const ids=new Set(),videos=new Set(),entries=[]
  for(const hint of editorialIndex.entries){
    const tmdbId=Number(hint?.tmdbId)
    if(!Number.isInteger(tmdbId)||tmdbId<=0
      ||hint.key!=='movie:'+tmdbId
      ||hint.mediaType!=='movie'
      ||hint.verificationStatus!=='not-independently-verified'
      ||!['free','rent-buy'].includes(hint.playlistMode)
      ||!(/^[A-Za-z0-9_-]{11}$/u).test(String(hint.videoId||''))
      ||hint.watchUrl!=='https://www.youtube.com/watch?v='+hint.videoId
      ||ids.has(tmdbId)||videos.has(hint.videoId)
      ||!byId.has(tmdbId))throw Error('YOUTUBE_SEARCH_COMPANION_HINT_INVALID')
    ids.add(tmdbId);videos.add(hint.videoId)
    const film=canonicalForIdentity(byId.get(tmdbId),{type:'movie',tmdbId})
    // Editorial membership may make the film searchable through the YouTube
    // provider filter; it must NOT manufacture a verified offer.
    entries.push({
      tmdbId,film:{...film,providerIds:[
        ...new Set([...(Array.isArray(film.providerIds)?film.providerIds:[]),'youtube']),
      ]},
    })
  }
  if(byId.size!==ids.size)throw Error('YOUTUBE_SEARCH_COMPANION_METADATA_COVERAGE')
  entries.sort((a,b)=>a.tmdbId-b.tmdbId)
  return {
    kind:YOUTUBE_SEARCH_TITLES_KIND,schemaVersion:1,providerId:'youtube',
    generatedAt:now,sourceVideoIds:editorialIndex.sourceVideoIds,
    sourceType:'user-curated-playlists-with-tmdb-metadata',
    offerVerification:'editorial-only-not-independent',
    count:entries.length,entries,
  }
}
