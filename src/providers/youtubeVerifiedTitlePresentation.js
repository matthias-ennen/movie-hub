import { selectYoutubeVerifiedTitleRoute } from './youtubeVerifiedRouteIndex.js'
import { selectCuratedEditorialTitleHint } from './youtubeCuratedEditorialIndex.js'

/**
 * One common provider presentation input. Canonical verified offers always
 * outrank provisional playlist declarations. Neither changes TMDB source data.
 */
export function withVerifiedYoutubeTitleOffer(item, routeIndex, {
  now = Date.now(), curatedIndex = null,
} = {}) {
  if (!item || typeof item !== 'object') return item
  // Never trust stale/transferred preview or verified offer fields on titles.
  const { verifiedTitleOffers: _untrusted, curatedPlaylistTitleOffer: _oldPreview, ...baseItem } = item
  const route = selectYoutubeVerifiedTitleRoute(routeIndex, baseItem, {
    now, hasYoutubeBadge: true,
  })
  if (route) {
    const entry = routeIndex.entries.find((candidate) =>
      candidate?.key === `${item.type}:${Number(item.tmdbId)}`)
    if (entry && ['free', 'ads', 'flatrate', 'rent', 'buy'].includes(entry.accessType)) {
      return {
        ...baseItem,
        verifiedTitleOffers: [{ id: 'youtube', offerTypes: [entry.accessType] }],
      }
    }
  }
  const provisional = selectCuratedEditorialTitleHint(curatedIndex, baseItem, { now })
  if (provisional) {
    return {
      ...baseItem,
      // Deliberately NOT verifiedTitleOffers or canonical liveAvailability.
      curatedPlaylistTitleOffer: {
        id:'youtube', playlistMode:provisional.playlistMode,
        videoId:provisional.videoId, provenance:'playlist-declared-not-verified',
      },
    }
  }
  return _untrusted || _oldPreview ? baseItem : item
}
