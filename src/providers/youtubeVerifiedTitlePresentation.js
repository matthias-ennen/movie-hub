import { selectYoutubeVerifiedTitleRoute } from './youtubeVerifiedRouteIndex.js'

/**
 * Add ONLY independently published and still-valid YouTube evidence to the
 * in-memory title view. Never rewrite TMDB offers or provider membership.
 * All poster/detail consumers share the existing providerPresentation model.
 */
export function withVerifiedYoutubeTitleOffer(item, routeIndex, { now = Date.now() } = {}) {
  if (!item || typeof item !== 'object') return item
  // Strip externally supplied or previously expired presentation hints.
  // This transient field is owned exclusively by the verified route index.
  const { verifiedTitleOffers: _untrusted, ...baseItem } = item
  const route = selectYoutubeVerifiedTitleRoute(routeIndex, baseItem, {
    now, hasYoutubeBadge: true,
  })
  if (!route) return _untrusted ? baseItem : item
  const entry = routeIndex.entries.find((candidate) => candidate?.key === `${item.type}:${Number(item.tmdbId)}`)
  if (!entry || !['free', 'ads', 'flatrate', 'rent', 'buy'].includes(entry.accessType)) return baseItem
  return {
    ...baseItem,
    // Separate from TMDB and from live-TV airings, never persisted to catalog.
    verifiedTitleOffers: [{ id: 'youtube', offerTypes: [entry.accessType] }],
  }
}
