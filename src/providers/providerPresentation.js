import { PROVIDER_REGISTRY } from './providerRegistry.js'

function text(value) {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
}

const PRIMARY_PROVIDER_ORDER = ['moviehub', 'waipu', 'joyn']
const PROVIDER_PRESENTATION_ORDER = [
  ...PRIMARY_PROVIDER_ORDER,
  ...PROVIDER_REGISTRY
    .map((provider) => provider.id)
    .filter((providerId) => !PRIMARY_PROVIDER_ORDER.includes(providerId)),
]
const PROVIDER_PRESENTATION_RANK = new Map(
  PROVIDER_PRESENTATION_ORDER.map((providerId, index) => [providerId, index]),
)

export function orderProviderIds(providerIds = [], {
  includeMovieHub = false,
} = {}) {
  const ordered = unique([
    ...(includeMovieHub ? ['moviehub'] : []),
    ...(Array.isArray(providerIds) ? providerIds : []),
  ])

  return ordered.sort((left, right) => {
    const leftRank = PROVIDER_PRESENTATION_RANK.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightRank = PROVIDER_PRESENTATION_RANK.get(right) ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank
  })
}

function tmdbProviderIds(item) {
  if (Array.isArray(item?.tmdbProviderIds)) return unique(item.tmdbProviderIds)
  const offers = Array.isArray(item?.tmdbProviderOffers)
    ? item.tmdbProviderOffers
    : Array.isArray(item?.providerOffers)
      ? item.providerOffers
      : []
  const fromOffers = offers
    .filter((offer) => Number.isFinite(Number(offer?.tmdbProviderId)))
    .map((offer) => offer?.id)
  if (fromOffers.length) return unique(fromOffers)
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

  const providerIds = orderProviderIds(context === 'airing'
    ? [
        ...tmdbIds,
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
