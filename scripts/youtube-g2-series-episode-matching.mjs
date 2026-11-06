/**
 * YouTube G2: explicit episode markers OR unique canonical episode titles -> a PRIVATE
 * episode-specific TMDB identity proposal. It never authorizes playback,
 * creates an episode, writes Firestore or publishes a provider link.
 */
export const YOUTUBE_EPISODE_REVIEW_KIND = 'moviehub-youtube-episode-identity-review'
const VIDEO = /^[A-Za-z0-9_-]{11}$/
const SEASON = /(?:s|staffel|season)\s*\d{1,2}/iu
const EPISODE = /(?:e|ep\.?|episode|folge)\s*\d{1,3}/iu
const SERIES_ID = x => Number.isSafeInteger(Number(x)) && Number(x) > 0 ? Number(x) : null
const NUM = (v,min=1) => Number.isSafeInteger(Number(v)) && Number(v) >= min ? Number(v) : null
const risky = /\b(?:trailer|teaser|clips?|ausschnitt|highlights?|reaction|review|recap|zusammenfassung|best.of|preview|vorschau|shorts?|intro|outro|parodie|parody|kommentar|analyse|making.of|behind.the.scenes)\b/iu
const patterns = [
  /\bs\s*(\d{1,2})\s*[-_. ]*e(?:p(?:isode)?)?\s*(\d{1,3})\b/giu,
  /\b(\d{1,2})\s*[x×]\s*(\d{1,3})\b/giu,
  /\b(?:staffel|season)\s*(\d{1,2})\s*[-:,.– ]*\s*(?:folge|episode|ep\.?)\s*(\d{1,3})\b/giu,
  /\b(?:folge|episode|ep\.?)\s*(\d{1,3})\s*[-:,.– ]*\s*(?:staffel|season)\s*(\d{1,2})\b/giu,
]
function fold(input) {
  return String(input || '').normalize('NFKD').replace(/\p{M}/gu,'')
    .replace(/ß/g,'ss').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ')
    .replace(/\s+/g,' ').trim()
}
function seriesKey(value) {
  return fold(value).replace(/^(?:the|die|der|das)\s+/u,'')
}
function explicitPairMatches(title) {
  const values = []
  for (let i=0;i<patterns.length;i++) {
    for (const match of title.matchAll(patterns[i])) {
      const seasonNumber = NUM(i===3?match[2]:match[1])
      const episodeNumber = NUM(i===3?match[1]:match[2])
      if (seasonNumber && episodeNumber) values.push({
        seasonNumber,episodeNumber,start:match.index,end:match.index+match[0].length,
      })
    }
  }
  return values
}
export function parseExplicitYoutubeEpisode(title) {
  const input = String(title || '').trim().slice(0,500)
  const pairs = explicitPairMatches(input)
  const episodeLike = pairs.length>0 || (SEASON.test(input) && EPISODE.test(input))
    || /\b(?:folge|episode|ep\.?)\s*\d{1,3}\b/iu.test(input)
  if (!episodeLike) return {episodeLike:false,status:'not-episode'}
  const doubleEpisode = /\b(?:doppelfolge|double.episode|episoden\s*\d+\s*(?:und|and|[+&/–-])\s*\d+)\b/iu.test(input)
    || /\bs\d{1,2}\s*e\d{1,3}\s*(?:e\d{1,3}|[+&/] *e?\d{1,3}|[-–] *e?\d{1,3}\b)/iu.test(input)
  if (pairs.length!==1 || doubleEpisode) {
    return {episodeLike:true,status:'review-missing-or-multiple-explicit-episode-pairs'}
  }
  if (risky.test(input)) {
    return {episodeLike:true,status:'review-trailer-clip-or-review'}
  }
  return {episodeLike:true,status:'candidate',...pairs[0]}
}
function canonicalRows(seasons) {
  const rows = [],seen = new Set()
  for (const season of Array.isArray(seasons)?seasons:[]) {
    const seriesTmdbId=SERIES_ID(season?.seriesTmdbId)
    const seasonNumber=NUM(season?.seasonNumber)
    const title=String(season?.seriesTitle||'').trim()
    if (!seriesTmdbId || !seasonNumber || !title || !Array.isArray(season.episodes)) continue
    for (const ep of season.episodes) {
      const episodeNumber=NUM(ep?.episodeNumber ?? ep?.episode_number)
      const episodeTmdbId=SERIES_ID(ep?.tmdbId ?? ep?.id)
      if (!episodeNumber || !episodeTmdbId) continue
      const key=[seriesTmdbId,seasonNumber,episodeNumber,episodeTmdbId].join(':')
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        seriesTmdbId,seasonNumber,episodeNumber,episodeTmdbId,
        seriesTitle:title,episodeTitle:String(ep?.title||ep?.name||'').trim(),
        episodeAliases:Array.isArray(ep?.titleAliases)
          ?ep.titleAliases.filter(x=>typeof x==='string').slice(0,12):[],
        runtimeMinutes:NUM(ep?.runtimeMinutes??ep?.runtime),
      })
    }
  }
  return rows
}
// Some user playlists contain just the episode's localized name, e.g.
// 'Stur, zwanghaft und unflexibel', without S01E01 or a series title.
// Match those titles only if they are specific, exactly equal to canonical
// TMDB episode metadata and unique across every cached series/season.
function titleOnlyKey(title) {
  const key=fold(title)
  if (key.length<12 || key.split(' ').length<2
    || /^(?:folge|episode|staffel|season|teil|part)\\s*\\d+$/u.test(key)
    || /^(?:pilot|finale|the end|intro|trailer)$/u.test(key)) return null
  return key
}
function indexEpisodeNames(canonical) {
  const map=new Map()
  for(const entry of canonical) {
    const names=[entry.episodeTitle,...entry.episodeAliases]
    for(const raw of names) {
      const key=titleOnlyKey(raw)
      if(!key)continue
      const current=map.get(key)||new Map()
      current.set(entry.seriesTmdbId+':'+entry.seasonNumber+':'
        +entry.episodeNumber+':'+entry.episodeTmdbId,entry)
      map.set(key,current)
    }
  }
  return map
}
function plausibleRuntime(video, canonical) {
  const actual=Number(video.minutes),runtime=Number(canonical.runtimeMinutes)
  return Number.isFinite(actual) && runtime>0
    && Math.abs(actual-runtime)<=Math.max(5,Math.ceil(runtime*0.25))
}
function episodeRef(found) {
  return {
    mediaType:'episode',seriesTmdbId:found.seriesTmdbId,
    episodeTmdbId:found.episodeTmdbId,
    seasonNumber:found.seasonNumber,episodeNumber:found.episodeNumber,
    seriesTitle:found.seriesTitle,episodeTitle:found.episodeTitle,
  }
}
function hasWholeName(title, series) {
  const key=seriesKey(series)
  // Whole-word matching only. A three-letter acronym is too weak to infer
  // canonical TV identity from a YouTube filename.
  if (key.length<4) return false
  const source=' '+fold(title)+' '
  return source.includes(' '+key+' ')
    || (fold(series)!==key && source.includes(' '+fold(series)+' '))
}
export function buildYoutubeEpisodeIdentityReview(audit, seasons, {
  now = new Date().toISOString(),
} = {}) {
  if (!['CURATED_DYNAMIC_PLAYLISTS_READ_ONLY','CURATED_TWO_PLAYLISTS_READ_ONLY'].includes(audit?.mode)
    || audit.fullyScanned!==true || audit.publicationPermitted!==false
    || !Number.isFinite(Date.parse(audit.observedAt))
    || !Number.isFinite(Date.parse(now))
    || Math.abs(Date.parse(now)-Date.parse(audit.observedAt))>24*3600_000
    || !Array.isArray(audit.candidates)
    || audit.uniqueVideoIds!==audit.candidates.length
    || new Set(audit.candidates.map(c=>c.videoId)).size!==audit.candidates.length
    || audit.candidates.some(c=>!VIDEO.test(String(c?.videoId||''))
      || c.accepted!==false || c.toImport!==false
      || c.playbackRoute!==null || c.verifiedOfferType!==null
      || !Array.isArray(c.playlistIds) || c.playlistIds.length===0)) {
    throw Error('YOUTUBE_EPISODE_AUDIT_NOT_TRUSTED')
  }
  const canonical=canonicalRows(seasons)
  const byName=indexEpisodeNames(canonical)
  const cases=[]
  let explicitEpisodeMarkers=0,episodeTitleOnlyCandidates=0
  for (const video of audit.candidates) {
    const marker=parseExplicitYoutubeEpisode(video.videoTitle)
    const matchesByName=!marker.episodeLike
      && video.videoTitle && Number(video.minutes)>=10 && Number(video.minutes)<=58
      ?[...(byName.get(titleOnlyKey(video.videoTitle))?.values()||[])]:[]
    if (!marker.episodeLike && matchesByName.length===0) continue
    if (marker.episodeLike) explicitEpisodeMarkers++
    else episodeTitleOnlyCandidates++
    const base={
      videoId:video.videoId,
      videoTitle:String(video.videoTitle||'').slice(0,180),
      durationMinutes:Number.isFinite(Number(video.minutes))?Number(video.minutes):null,
      playlistIds:[...video.playlistIds],
      playlistOfferHint:video.editorialOfferHint,
      // No published route, no offer verification, no episode creation.
      verifiedDEOffer:false,independentlyVerifiedEpisode:false,
      publishedPlaybackRoute:null,approved:false,
    }
    let status=marker.episodeLike?marker.status:'review-episode-title-unconfirmed',ref=null
    let matched=null
    if (!marker.episodeLike) {
      // Only one canonical episode may own an episode-title-only YouTube name.
      // Do not treat overlapping names, clips or unavailable regional metadata
      // as confirmed identity, even when the source is in a R&B playlist.
      if (risky.test(String(video.videoTitle))) {
        status='review-trailer-clip-or-review'
      } else if(video.deRegionSignal==='excluded' || !video.youtubeWatchUrl) {
        status='review-unavailable-region-or-runtime'
      } else if(matchesByName.length!==1) {
        status='review-episode-title-collision'
      } else if(!matchesByName[0].runtimeMinutes) {
        status='review-canonical-runtime-unavailable'
      } else if(!plausibleRuntime(video,matchesByName[0])) {
        status='review-runtime-disagrees-with-episode'
      } else {
        status='review-exact-episode-metadata-candidate'
        matched=matchesByName[0]
        ref=episodeRef(matched)
      }
    }
    if (status==='candidate') {
      if (video.deRegionSignal==='excluded' || !video.youtubeWatchUrl
        || !(Number(video.minutes)>=10 && Number(video.minutes)<=120)) {
        status='review-unavailable-region-or-runtime'
      } else {
        const matches=canonical.filter(c=>c.seasonNumber===marker.seasonNumber
          &&c.episodeNumber===marker.episodeNumber
          &&hasWholeName(video.videoTitle,c.seriesTitle))
        if (!matches.length) status='review-no-exact-local-tmdb-episode'
        else if (new Set(matches.map(m=>m.seriesTmdbId+':'+m.episodeTmdbId)).size!==1) {
          status='review-series-or-episode-identity-collision'
        } else {
          const found=matches[0],runtime=found.runtimeMinutes
          if (!runtime) status='review-canonical-runtime-unavailable'
          else if (!plausibleRuntime(video,found)) {
            status='review-runtime-disagrees-with-episode'
          } else {
            status='review-exact-episode-metadata-candidate'
            matched=found
            ref=episodeRef(found)
          }
        }
      }
    }
    cases.push({...base,status,identityEvidence:marker.episodeLike
      ?'explicit-season-episode-markers':'exact-unique-canonical-episode-title',
      ...(marker.seasonNumber&&marker.episodeNumber?{
        seasonNumber:marker.seasonNumber,episodeNumber:marker.episodeNumber,
      }:matched?{seasonNumber:matched.seasonNumber,episodeNumber:matched.episodeNumber}:{}),
      canonicalEpisodeProposal:ref,
    })
  }
  const groups=Object.fromEntries([...new Set(cases.map(v=>v.status))].sort()
    .map(x=>[x,cases.filter(v=>v.status===x).length]))
  return {
    kind:YOUTUBE_EPISODE_REVIEW_KIND,schemaVersion:1,
    generatedAt:now,sourceQAObservedAt:audit.observedAt,
    sourceVideoIds:audit.uniqueVideoIds,processedVideoIds:audit.candidates.length,
    episodeMarkedVideos:explicitEpisodeMarkers,
    episodeTitleOnlyCandidates,
    episodeIdentityReviewCases:cases.length,
    canonicalEpisodeProposals:cases.filter(
      c=>c.canonicalEpisodeProposal).length,reviewStatusCounts:groups,
    verifiedDEEpisodeOffers:0,publishedEpisodeLinks:0,
    firestoreWrites:0,catalogWrites:0,providerWrites:0,
    publicationPermitted:false,privateArtifact:true,cases,
  }
}
