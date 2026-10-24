/**
 * Public, non-personal canonical TMDB search metadata for *all* currently
 * published YouTube playlist film identities, new or already in MovieHub.
 * This feed DOES NOT independently verify YouTube offers or playback rights.
 */
export const YOUTUBE_SEARCH_TITLES_PUBLIC_URL='/youtube-curated-search-titles.json'
const KIND='moviehub-youtube-curated-search-title-metadata'
const validAt=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
export function validateYoutubeCuratedSearchTitleFeed(feed,{now=Date.now()}={}){
  if(feed?.kind!==KIND||feed.schemaVersion!==1
    ||feed.providerId!=='youtube'
    ||feed.sourceType!=='user-curated-playlists-with-tmdb-metadata'
    ||feed.offerVerification!=='editorial-only-not-independent'
    ||!validAt(feed.generatedAt)
    ||Date.parse(feed.generatedAt)>Number(now)+60000
    ||Number(now)-Date.parse(feed.generatedAt)>7*86400000
    ||!Number.isInteger(feed.count)||feed.count<0||feed.count>200
    ||!Number.isInteger(feed.sourceVideoIds)||feed.sourceVideoIds<feed.count
    ||!Array.isArray(feed.entries)||feed.entries.length!==feed.count)return false
  const seen=new Set()
  for(const entry of feed.entries){
    const id=Number(entry?.tmdbId)
    const film=entry?.film
    if(!Number.isInteger(id)||id<=0||seen.has(id)
      ||film?.type!=='movie'||film.tmdbId!==id
      ||film.source!=='tmdb'||film.id!=='tmdb-movie-'+id
      ||!film.title||!film.description||!film.posterUrl
      ||film.metadataComplete!==true
      ||!Array.isArray(film.providerIds)||!film.providerIds.includes('youtube')
      ||film.verifiedTitleOffers||film.curatedPlaylistTitleOffer
      ||film.liveAvailability||film.titleSnapshot||film.personal
      ||film.watched===true||film.favorite===true) return false
    seen.add(id)
  }
  return true
}
