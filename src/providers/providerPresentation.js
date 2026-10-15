import { PROVIDER_REGISTRY } from './providerRegistry.js'

function text(value) {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
}

export { orderProviderIds } from './providerOrder.js'
import { orderProviderIds } from './providerOrder.js'

const LIVE_SOURCE_PROVIDER_IDS = new Set(PROVIDER_REGISTRY
  .filter((provider) => Boolean(provider.liveTvSource))
  .map((provider) => provider.id))

function tmdbProviderIds(item) {
  const offers = Array.isArray(item?.tmdbProviderOffers)
    ? item.tmdbProviderOffers
    : Array.isArray(item?.providerOffers) ? item.providerOffers : []
  const evidenced = offers
    .filter((offer) => Array.isArray(offer?.offerTypes) && offer.offerTypes.length)
    .map((offer) => offer?.id)
  if (Array.isArray(item?.tmdbProviderIds)) return unique([...item.tmdbProviderIds, ...evidenced])
  const indexed = offers
    .filter((offer) => Number.isFinite(Number(offer?.tmdbProviderId)))
    .map((offer) => offer?.id)
  if (indexed.length || evidenced.length) return unique([...indexed, ...evidenced])
  return unique(item?.providerIds).filter((providerId) => (
    providerId !== 'moviehub' && providerId !== 'waipu' && providerId !== 'joyn'
  ))
}

function liveProviderIds(item) {
  const fromAvailability = Object.keys(item?.liveAvailability || {})
  const fromTvLive = unique(item?.tvLive?.providerIds)
  const legacy = []
  if (item?.waipuLive) legacy.push('waipu')
  if (item?.joynLive) legacy.push('joyn')
  return unique([...fromAvailability, ...fromTvLive, ...legacy])
}

function airingProviderIds(item) {
  const airing = item?.tvAiring
  if (!airing) return []
  if (Array.isArray(airing?.providerIds) && airing.providerIds.length) {
    return unique(airing.providerIds)
  }
  const ids = []
  if (item?.waipuLive) ids.push('waipu')
  if (item?.joynLive) ids.push('joyn')
  return unique(ids)
}

export function resolveProviderPresentation(item, {
  context = 'title',
  hasMovieHub = false,
} = {}) {
  const tmdbIds = tmdbProviderIds(item)
  const titleLiveIds = liveProviderIds(item)
  const concreteAiringIds = airingProviderIds(item)
  const movieHub = Boolean(hasMovieHub || item?.movieHubCatalog === true)

  const airingTmdbIds = tmdbIds.filter((providerId) => !LIVE_SOURCE_PROVIDER_IDS.has(providerId))
  const providerIds = orderProviderIds(context === 'airing'
    ? [
        ...airingTmdbIds,
        ...concreteAiringIds,
      ]
    : [
        ...tmdbIds,
        ...titleLiveIds,
      ])

  return {
    context,
    providerIds,
    includeMovieHub: movieHub,
    tmdbProviderIds: tmdbIds,
    liveProviderIds: context === 'airing' ? concreteAiringIds : titleLiveIds,
    providerEvidence: item?.providerEvidence || {},
    playbackRoutes: context === 'airing'
      ? (Array.isArray(item?.tvAiring?.playbackRoutes) ? item.tvAiring.playbackRoutes : [])
      : Object.values(item?.liveAvailability || {}).flatMap((availability) => (
          Array.isArray(availability?.playbackRoutes) ? availability.playbackRoutes : []
        )),
  }
}
