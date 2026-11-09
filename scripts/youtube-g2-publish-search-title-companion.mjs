/**
 * Canonical TMDB film metadata to make every published YouTube editorial
 * movie searchable, even after the user marks it as a personal favorite.
 * Public output is TMDB metadata ONLY. No private catalog membership and
 * no independent DE offer verification is carried into the companion.
 */
import { canonicalForIdentity } from './execute-title-priority-queue.mjs'
import {validateYoutubeNewFilmFeed} from '../src/catalog/youtubeCuratedNewFilms.js'
import {validateYoutubeCuratedSearchTitleFeed} from '../src/catalog/youtubeCuratedSearchTitles.js'

export const YOUTUBE_SEARCH_TITLES_KIND='moviehub-youtube-curated-search-title-metadata'
export const YOUTUBE_SEARCH_TITLES_OUTPUT='public/youtube-curated-search-titles.json'
// All validated Admin playlists may yield more than 200 editorial film candidates.
export const YOUTUBE_SEARCH_TITLE_MAX_ENTRIES=2000

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
    ||editorialIndex.count>YOUTUBE_SEARCH_TITLE_MAX_ENTRIES
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

/**
 * Build three mutually consistent public artifacts. A single TMDB title
 * lacking public-safe metadata is REVIEW-ONLY; its film feed row AND its
 * editorial watch hint must be withheld together. Malformed source envelopes,
 * invalid video routes, duplicate identities, and dangling references are
 * still fatal, rather than being silently treated as ordinary missing artwork.
 *
 * canonicalById is keyed by the REQUESTED TMDB ID. This deliberately lets
 * us quarantine a TMDB response with a wrong identity, without confusing it
 * with the metadata for another valid video.
 */
export function prepareYoutubeCuratedSearchPublication({
  editorialIndex,filmFeed,canonicalById,now=new Date().toISOString(),
}={}){
  const timestamp=Date.parse(now)
  if(!Number.isFinite(timestamp)||!(canonicalById instanceof Map)
    ||editorialIndex?.kind!=='moviehub-youtube-curated-editorial-title-hints'
    ||editorialIndex.schemaVersion!==1||editorialIndex.providerId!=='youtube'
    ||editorialIndex.publicationAuthority!=='editorial-playlist-only'
    ||editorialIndex.verifiedDEOffers!==0||editorialIndex.verifiedPlaybackRoutes!==0
    ||!Number.isInteger(editorialIndex.sourceVideoIds)
    ||editorialIndex.sourceVideoIds<0
    ||!Array.isArray(editorialIndex.entries)
    ||editorialIndex.count!==editorialIndex.entries.length
    ||editorialIndex.count>YOUTUBE_SEARCH_TITLE_MAX_ENTRIES
    ||filmFeed?.generatedAt!==editorialIndex.generatedAt
    ||filmFeed.sourceVideoIds!==editorialIndex.sourceVideoIds
    ||editorialIndex.generatedAt!==now
    ||!validateYoutubeNewFilmFeed(filmFeed,{now:timestamp}))
    throw Error('YOUTUBE_SEARCH_COMPANION_PUBLICATION_SOURCE_INVALID')

  // Validate ALL source links, including those later held for missing metadata.
  // A forged route, duplicated ID or inconsistent new-film link never gets
  // hidden by the quarantine logic.
  const videoIds=new Set(),tmdbIds=new Set(),hintById=new Map()
  for(const hint of editorialIndex.entries){
    const id=hint?.tmdbId
    if(!Number.isInteger(id)||id<=0
      ||hint.key!=='movie:'+id||hint.mediaType!=='movie'
      ||hint.verificationStatus!=='not-independently-verified'
      ||!['free','rent-buy'].includes(hint.playlistMode)
      ||!(/^[A-Za-z0-9_-]{11}$/u).test(String(hint.videoId||''))
      ||hint.watchUrl!=='https://www.youtube.com/watch?v='+hint.videoId
      ||tmdbIds.has(id)||videoIds.has(hint.videoId))
      throw Error('YOUTUBE_SEARCH_COMPANION_SOURCE_LINK_INVALID')
    tmdbIds.add(id);videoIds.add(hint.videoId);hintById.set(id,hint)
  }
  const newFilmIds=new Set()
  for(const row of filmFeed.entries){
    const hint=hintById.get(row.tmdbId)
    if(!hint||hint.videoId!==row.videoId
      ||hint.playlistMode!==(row.playlistClass==='FREE'?'free':'rent-buy')
      ||newFilmIds.has(row.tmdbId))
      throw Error('YOUTUBE_SEARCH_COMPANION_NEW_FILM_LINK_INVALID')
    newFilmIds.add(row.tmdbId)
  }
  if(canonicalById.size!==tmdbIds.size
    ||[...canonicalById.keys()].some(id=>!tmdbIds.has(id)))
    throw Error('YOUTUBE_SEARCH_COMPANION_CANONICAL_COVERAGE_INVALID')

  const safeIds=new Set(),heldReasons={}
  for(const id of tmdbIds){
    const movie=canonicalById.get(id)
    const reason=!movie||movie.type!=='movie'||movie.source!=='tmdb'
      ||movie.tmdbId!==id||movie.id!=='tmdb-movie-'+id
      ?'canonical-identity-mismatch'
      :!movie.title?'title-missing'
        :!movie.description?'description-missing'
          :!movie.posterUrl?'poster-missing'
            :movie.metadataComplete!==true?'metadata-incomplete'
              :movie.verifiedTitleOffers||movie.curatedPlaylistTitleOffer
                ||movie.liveAvailability||movie.titleSnapshot||movie.personal
                ||movie.watched===true||movie.favorite===true
                ?'non-public-canonical-fields':null
    if(reason)heldReasons[reason]=(heldReasons[reason]||0)+1
    else safeIds.add(id)
  }
  const hints=editorialIndex.entries.filter(hint=>safeIds.has(hint.tmdbId))
  const films=filmFeed.entries.filter(row=>safeIds.has(row.tmdbId))
  const safeEditorialIndex={...editorialIndex,count:hints.length,entries:hints}
  const safeFilmFeed={...filmFeed,count:films.length,entries:films}
  const searchFeed=buildYoutubeCuratedSearchTitleFeed(
    safeEditorialIndex,hints.map(hint=>canonicalById.get(hint.tmdbId)),{now})
  if(!validateYoutubeNewFilmFeed(safeFilmFeed,{now:timestamp})
    ||!validateYoutubeCuratedSearchTitleFeed(searchFeed,{now:timestamp})
    ||searchFeed.count!==safeEditorialIndex.count)
    throw Error('YOUTUBE_SEARCH_COMPANION_PREPARED_TRIPLET_INVALID')
  return {
    editorialIndex:safeEditorialIndex,filmFeed:safeFilmFeed,searchFeed,
    heldSummary:{
      sourceEditorialHints:editorialIndex.count,
      publishedEditorialHints:safeEditorialIndex.count,
      heldEditorialHints:editorialIndex.count-safeEditorialIndex.count,
      publishedNewFilms:safeFilmFeed.count,
      heldNewFilms:filmFeed.count-safeFilmFeed.count,
      heldReasons,
    },
  }
}
