import { providers } from '../data/catalog.js'
import { resolveProviderPresentation } from './providerPresentation.js'
import { providerOfferLabel } from './providerOfferLabels.js'

export const MAX_POSTER_PROVIDERS = 3

// Canonical, local-only provider projection shared by every poster surface.
export function resolvePosterProviderModel(item, {
  hasMovieHub = false,
  context = item?.tvAiring ? 'airing' : 'title',
  maxVisible = MAX_POSTER_PROVIDERS,
} = {}) {
  const presentation = resolveProviderPresentation(item, { context, hasMovieHub })
  const candidates = [
    ...(presentation.includeMovieHub ? ['moviehub'] : []),
    ...presentation.providerIds,
  ].filter((id) => Boolean(providers[id]))
  const allProviderIds = [...new Set(candidates)]
  const limit = Number.isFinite(maxVisible) ? Math.max(0, Math.min(MAX_POSTER_PROVIDERS, maxVisible)) : MAX_POSTER_PROVIDERS
  const providerIds = allProviderIds.slice(0, limit)

  return {
    providerIds,
    allProviderIds,
    context: presentation.context,
    includeMovieHub: providerIds.includes('moviehub'),
    offerLabels: Object.fromEntries(providerIds.map((providerId) => [
      providerId,
      providerOfferLabel(item, providerId, { context: presentation.context }),
    ])),
    hasAvailability: allProviderIds.length > 0,
    availabilityVerified: allProviderIds.length > 0
      || item?.metadataChecks?.providers === 'present'
      || item?.metadataChecks?.providers === 'absent',
  }
}
