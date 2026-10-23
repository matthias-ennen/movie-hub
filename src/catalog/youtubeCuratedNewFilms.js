/**
 * The YouTube catalog enrichment carries TMDB movies, never personal data.
 * It is an additional source of canonical titles, not an independent service,
 * and may NOT turn an editorial playlist hint into a verified availability.
 */
export const YOUTUBE_NEW_FILMS_PUBLIC_URL='/youtube-curated-new-films.json'
const kind='moviehub-youtube-curated-new-film-metadata'
const vid=/^[A-Za-z0-9_-]{11}$/
const validDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))
const keyOf=t=>t?.type==='movie'&&Number.isInteger(Number(t.tmdbId))&&Number(t.tmdbId)>0
  ?'movie:'+Number(t.tmdbId):null
export function validateYoutubeNewFilmFeed(feed,{now=Date.now()}={}){
  if(feed?.kind!==kind||feed.schemaVersion!==1||feed.providerId!=='youtube'
    ||feed.offerVerification!=='editorial-only-not-independent'
    ||feed.sourceType!=='user-curated-playlists-with-tmdb-metadata'
    ||!validDate(feed.generatedAt)
    ||Date.parse(feed.generatedAt)>Number(now)+60000
    ||Number(now)-Date.parse(feed.generatedAt)>7*86400000
    ||!Number.isInteger(feed.count)||feed.count>50||feed.count<0
    ||!Array.isArray(feed.entries)||feed.entries.length!==feed.count
    ||!Number.isInteger(feed.sourceVideoIds)||feed.sourceVideoIds<feed.count){
    return false
  }
  const keys=new Set(),videos=new Set()
  for(const entry of feed.entries){
    const t=entry?.film
    const k=keyOf(t)
    if(!k||Number(entry.tmdbId)!==Number(t.tmdbId)
      ||t.source!=='tmdb'||t.id!=='tmdb-movie-'+entry.tmdbId
      ||!['FREE','R&B'].includes(entry.playlistClass)
      ||!vid.test(String(entry.videoId||''))
      ||!t.title||!t.description||!t.metadataComplete
      ||!t.posterUrl||keys.has(k)||videos.has(entry.videoId)
      ||t.curatedPlaylistTitleOffer||t.verifiedTitleOffers
      ||t.liveAvailability){
      return false
    }
    keys.add(k);videos.add(entry.videoId)
  }
  return true
}
export function mergeYoutubeNewFilmsIntoCatalog(catalog,feed,{now=Date.now()}={}){
  if(!validateYoutubeNewFilmFeed(feed,{now}))return catalog
  if(!Array.isArray(catalog?.titles)||!catalog.titles.length)return catalog
  const titles=[...catalog.titles]
  const keys=new Set(titles.map(t=>t?.type==='movie'?'movie:'+Number(t.tmdbId):null).filter(Boolean))
  const additions=[]
  for(const entry of feed.entries){
    const k=keyOf(entry.film)
    if(keys.has(k))continue
    keys.add(k)
    additions.push(entry.film)
    titles.push(entry.film)
  }
  if(!additions.length)return catalog
  const providerCatalogs={...(catalog.providerCatalogs||{})}
  const youtube=providerCatalogs.youtube
  if(youtube&&typeof youtube==='object'){
    const newIds=additions.map(x=>x.id)
    const movieIds=[...new Set([...(youtube.movieIds||[]),...newIds])]
    const homeIds=[...new Set([...(youtube.homeIds||[]),...newIds])]
    providerCatalogs.youtube={
      ...youtube,movieIds,movieCount:movieIds.length,
      homeIds,
    }
  }
  return {...catalog,titles,providerCatalogs}
}
