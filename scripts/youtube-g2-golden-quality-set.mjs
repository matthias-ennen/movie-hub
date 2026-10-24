/** AP1: versioned regression fixtures. IDs are public YouTube video identifiers;
 * all verdicts are review-only, not playback-rights or offer approvals.
 * A future matcher may improve evidence, but cannot silently promote these
 * known negatives or change the canonical work identity.
 */
export const YOUTUBE_G2_GOLDEN_SET_VERSION=1
export const YOUTUBE_G2_GOLDEN_CASES=Object.freeze([
  {id:'first-blood-work',direction:'youtube-first',videoId:'70DVMOSzN3E',
    title:'Rambo - First Blood',expectedTmdbId:1368,
    forbiddenTmdbIds:[1370],gate:'film-vs-tv-review',offerVerified:false},
  {id:'knockin-free',direction:'youtube-first',videoId:'RqLsh88GYKc',
    title:'Knockin on Heavens Door',expectedTmdbId:158,
    competingVideoId:'xJ2PbAb2zCw',gate:'competing-versions-review',offerVerified:false},
  {id:'knockin-rent-buy',direction:'youtube-first',videoId:'xJ2PbAb2zCw',
    title:'Knockin on Heavens Door',expectedTmdbId:158,
    competingVideoId:'RqLsh88GYKc',gate:'competing-versions-review',offerVerified:false},
  {id:'das-boot-de-excluded',direction:'youtube-first',videoId:'sNrYK2m5LJs',
    title:'Das Boot Directors Cut',gate:'region-excluded',offerVerified:false},
  {id:'odyssey-short',direction:'youtube-first',videoId:'OVNYmGj3ii4',
    title:'The Odyssey',gate:'short-video-not-full-film',offerVerified:false},
  {id:'in-time-search-only',direction:'youtube-first',videoId:'OCeoe2Y5xJQ',
    title:'In Time',expectedTmdbId:49530,gate:'search-only-identity-review',offerVerified:false},
  {id:'werner-search-only',direction:'youtube-first',videoId:'QGxhpwUiscU',
    title:'Werner - Beinhart',expectedTmdbId:9742,gate:'search-only-identity-review',offerVerified:false},
  {id:'jeepers-ambiguous',direction:'youtube-first',videoId:'WWaDDo2DAmM',
    title:'Jeepers Creepers',expectedTmdbId:8922,gate:'multiple-candidates-review',offerVerified:false},
  {id:'tmdb-first-public-badge',direction:'tmdb-first',tmdbId:1368,
    gate:'exact-de-provider-and-video-evidence-required',offerVerified:false},
  {id:'tmdb-first-series',direction:'tmdb-first',mediaType:'series',
    gate:'series-episode-route-review',offerVerified:false},
])
export function auditYoutubeG2GoldenSet(cases=YOUTUBE_G2_GOLDEN_CASES){
  const ids=new Set(),videos=new Set(),counts={}
  for(const c of cases){
    if(!c?.id||ids.has(c.id)||!['youtube-first','tmdb-first'].includes(c.direction)
      ||c.offerVerified!==false||!c.gate)throw Error('G2_GOLDEN_CASE_INVALID')
    ids.add(c.id)
    if(c.direction==='youtube-first'){
      if(!/^[A-Za-z0-9_-]{11}$/.test(c.videoId)||videos.has(c.videoId))
        throw Error('G2_GOLDEN_VIDEO_INVALID')
      videos.add(c.videoId)
    }else if(c.videoId)throw Error('G2_GOLDEN_TMDB_FIRST_VIDEO_PREAPPROVED')
    if(c.expectedTmdbId&&c.forbiddenTmdbIds?.includes(c.expectedTmdbId))
      throw Error('G2_GOLDEN_WORK_CONTRADICTION')
    counts[c.direction]=(counts[c.direction]||0)+1
  }
  for(const c of cases){
    if(c.competingVideoId&&(!videos.has(c.competingVideoId)
      ||c.competingVideoId===c.videoId))
      throw Error('G2_GOLDEN_COMPETITOR_NOT_IN_SET')
  }
  return {schemaVersion:YOUTUBE_G2_GOLDEN_SET_VERSION,count:ids.size,
    byDirection:counts,verifiedOffers:0,publicationPermitted:false}
}
