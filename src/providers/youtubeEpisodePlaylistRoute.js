/**
 * Typed, episode-scoped playlist shortcut. Not a verified title offer.
 * The app never matches by text: all identities come from the nightly TMDB
 * season shard. 'title' is the legacy Android bridge scope; the source
 * contract remains pinned to ONE canonical episode ID and season/episode.
 */
const MODES=new Set(['free','ads','flatrate','rent','buy','rent-buy'])
const ID=/^[A-Za-z0-9_-]{11}$/
const pos=n=>Number.isSafeInteger(n)&&n>0
const WATCH=id=>'https://www.youtube.com/watch?v='+id
const MAX_AGE=72*3600_000
export const EPISODE_YOUTUBE_MODE_LABELS=Object.freeze({
  free:'FREE',ads:'ADS',flatrate:'FLAT',rent:'RENT',buy:'BUY','rent-buy':'R&B',
})
export function selectYoutubeEpisodePlaylistRoute(raw,episode,{now=Date.now()}={}){
  if(!raw||!episode||raw.kind!=='moviehub-youtube-editorial-episode-hint'
    ||raw.schemaVersion!==1||raw.providerId!=='youtube'
    ||raw.verificationStatus!=='not-independently-verified'
    ||!['exact-unique-canonical-episode-title','explicit-season-episode-markers'].includes(raw.evidence)
    ||!MODES.has(raw.playlistMode)||!ID.test(String(raw.videoId||''))
    ||raw.watchUrl!==WATCH(raw.videoId)
    ||!pos(raw.seriesTmdbId)||!pos(raw.episodeTmdbId)
    ||!pos(raw.seasonNumber)||!pos(raw.episodeNumber)
    ||Number(episode.seriesTmdbId)!==raw.seriesTmdbId
    ||Number(episode.tmdbId)!==raw.episodeTmdbId
    ||Number(episode.seasonNumber)!==raw.seasonNumber
    ||Number(episode.episodeNumber)!==raw.episodeNumber
    ||!Number.isFinite(Number(now))
    ||!Number.isFinite(Date.parse(raw.generatedAt))
    ||!Number.isFinite(Date.parse(raw.expiresAt))
    ||Date.parse(raw.expiresAt)-Date.parse(raw.generatedAt)!==MAX_AGE
    ||Date.parse(raw.generatedAt)>Number(now)+60_000
    ||Date.parse(raw.expiresAt)<=Number(now))return null
  return {
    providerId:'youtube',
    // Reuse the exact-video Android bridge already supported by installed APKs;
    // episode scope is verified by identity before any native launch.
    mode:'APP_DEEP_LINK',scope:'title',episodeScoped:true,
    target:raw.watchUrl,videoId:raw.videoId,
    playlistMode:raw.playlistMode,
    verificationStatus:'not-independently-verified',
    episodeTmdbId:raw.episodeTmdbId,
  }
}
