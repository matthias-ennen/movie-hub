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
