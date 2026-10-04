export function buildDetailLiveProviderEntries(
  providerPresentation,
  providers = {},
  liveRouteSnapshot = {},
) {
  const orderedProviderIds = Array.isArray(providerPresentation?.providerIds)
    ? providerPresentation.providerIds
    : []
  const liveProviderIds = new Set(
    Array.isArray(providerPresentation?.liveProviderIds)
      ? providerPresentation.liveProviderIds
      : [],
  )

  return orderedProviderIds
    .filter((providerId) => liveProviderIds.has(providerId))
    .filter((providerId) => Boolean(providers?.[providerId]))
    .map((providerId) => ({
      providerId,
      canLaunch: Boolean(liveRouteSnapshot?.[providerId]),
    }))
}

export function buildDetailStreamingProviderIds(
  titleProviderPresentation,
  providers = {},
  liveProviderEntries = [],
) {
  const orderedProviderIds = Array.isArray(titleProviderPresentation?.providerIds)
    ? titleProviderPresentation.providerIds
    : []
  const tmdbProviderIds = new Set(
    Array.isArray(titleProviderPresentation?.tmdbProviderIds)
      ? titleProviderPresentation.tmdbProviderIds
      : [],
  )
  const concreteLiveProviderIds = new Set(
    (Array.isArray(liveProviderEntries) ? liveProviderEntries : [])
      .map((entry) => entry?.providerId)
      .filter(Boolean),
  )

  return orderedProviderIds
    .filter((providerId) => tmdbProviderIds.has(providerId))
    .filter((providerId) => !concreteLiveProviderIds.has(providerId))
    .filter((providerId) => Boolean(providers?.[providerId]))
}
