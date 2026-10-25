import {
  BEST_EFFORT_YOUTUBE_KIND,
  BEST_EFFORT_YOUTUBE_VERSION,
} from './youtubeBestEffortRouteIndex.js'

// Optional public *link-only* projection of private known-ID review QA.
// Missing/old/invalid data never changes TMDB badges or their search fallback.
// Do not keep a promise forever: a resumed TV/WebView session must see
// newly published and revoked links rather than reusing a stale index.
export const YOUTUBE_BEST_EFFORT_LINKS_URL='/youtube-best-effort-title-links.json'
export function loadYoutubeBestEffortTitleLinks(request=fetch){
  const promise=Promise.resolve()
    .then(()=>request(YOUTUBE_BEST_EFFORT_LINKS_URL,{redirect:'error',cache:'no-store'}))
    .then(async response=>{
      if(!response?.ok)return null
      const data=await response.json()
      return data?.kind===BEST_EFFORT_YOUTUBE_KIND
        &&data.schemaVersion===BEST_EFFORT_YOUTUBE_VERSION
        &&data.providerId==='youtube'
        &&data.sourceMode==='cached-known-video-ids-only'
        &&data.verifiedDEOffers===0&&data.verifiedPlaybackRoutes===0
        &&data.providerBadgeWrites===0
        &&Array.isArray(data.claimedOfferTypes)&&data.claimedOfferTypes.length===0
        &&Array.isArray(data.entries)&&data.count===data.entries.length
        ?data:null
    })
    .catch(()=>null)
  return promise
}
