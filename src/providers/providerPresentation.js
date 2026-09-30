function text(value) {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
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
  return unique([...fromAvailability, ...fromTvLive])
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

  const providerIds = context === 'airing'
    ? unique([
        ...tmdbIds,
        ...concreteAiringIds,
      ])
    : unique([
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
