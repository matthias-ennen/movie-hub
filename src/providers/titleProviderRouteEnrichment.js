/**
 * Join multiple independently published provider projections onto ONE
 * canonical MovieHub title identity (movie:tmdbId / series:tmdbId).
 *
 * Only independently verified offers are "verifiedTitleOffers". Playlist and
 * best-effort watch shortcuts remain explicitly NOT verified. No source is
 * allowed to change the base TMDB provider evidence or assert DE rights.
 * The resulting titleProviderRoutes are ephemeral view-model properties,
 * never written to Firestore, a canonical offer index or a badge source.
 */
import {withVerifiedYoutubeTitleOffer} from './youtubeVerifiedTitlePresentation.js'
import {selectYoutubeVerifiedTitleRoute} from './youtubeVerifiedRouteIndex.js'
import {selectCuratedEditorialTitleHint} from './youtubeCuratedEditorialIndex.js'
import {selectYoutubeBestEffortTitleRoute}
  from './youtubeBestEffortRouteIndex.js'
import {resolveProviderPresentation} from './providerPresentation.js'

export const TITLE_ROUTE_EVIDENCE = Object.freeze({
  VERIFIED:'independently-verified-source',
  EDITORIAL:'curated-playlist-not-verified',
  BEST_EFFORT:'cached-video-match-not-verified',
})

export function enrichTitleProviderRoutes(item,{
  youtubeVerified=null,youtubeCurated=null,youtubeBestEffort=null,
  now=Date.now(),
}={}){
  if(!item || typeof item!=='object')return item
  // Never trust a previously attached projection. The three supplied public
  // indices, each with its own source/expiry/film/collision validation,
  // are the only authorities to recreate a title-wide route.
  const {
    titleProviderRoutes:_routes,
    titleProviderRouteEvidence:_evidence,
    ...canonicalTitle
  }=item
  const title=withVerifiedYoutubeTitleOffer(canonicalTitle,youtubeVerified,{
    now,curatedIndex:youtubeCurated,
  })
  const verified=selectYoutubeVerifiedTitleRoute(youtubeVerified,title,{
    now,hasYoutubeBadge:true,
  })
  const editorial=!verified
    ?selectCuratedEditorialTitleHint(youtubeCurated,title,{now}):null
  const hasExistingYoutubeBadge=resolveProviderPresentation(canonicalTitle,{
    context:'title',
  }).tmdbProviderIds.includes('youtube')
  const bestEffort=!verified&&!editorial&&hasExistingYoutubeBadge
    ?selectYoutubeBestEffortTitleRoute(youtubeBestEffort,title,{
      now,hasYoutubeBadge:true,
    }):null
  const route=verified||editorial||bestEffort
  if(!route)return title
  const source=verified?TITLE_ROUTE_EVIDENCE.VERIFIED
    :editorial?TITLE_ROUTE_EVIDENCE.EDITORIAL:TITLE_ROUTE_EVIDENCE.BEST_EFFORT
  return {
    ...title,
    titleProviderRoutes:{
      youtube:route,
    },
    titleProviderRouteEvidence:{
      youtube:{
        source,independentlyVerified:Boolean(verified),
        // A public route shortcut is never TMDB provider evidence.
        altersTmdbProviderBadge:false,
      },
    },
  }
}
