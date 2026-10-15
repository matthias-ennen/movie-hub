import { compactProviderOffers } from '../providers/providerOfferSnapshot.js'

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
  item = null,
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

  const streamedWithKnownOffer = new Set(compactProviderOffers(item).map((offer) => offer.id))

  return orderedProviderIds
    .filter((providerId) => tmdbProviderIds.has(providerId))
    // Separate VOD offers can coexist with live broadcasting on the same provider.
    .filter((providerId) => !concreteLiveProviderIds.has(providerId) || streamedWithKnownOffer.has(providerId))
    .filter((providerId) => Boolean(providers?.[providerId]))
}
