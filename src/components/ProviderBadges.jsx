import { providerDirectory, providers } from '../data/catalog.js'
import { orderProviderIds } from '../providers/providerPresentation.js'
import { providerOfferLabel } from '../providers/providerOfferLabels.js'

export const MAX_VISIBLE_PROVIDER_BADGES = 3

export function ProviderBadge({ providerId, item = null, context = 'title' }) {
  const provider = providerDirectory[providerId]
  if (!provider) return null
  const classId = providerId === 'moviehub' ? 'movie-hub' : providerId
  const offerLabel = providerOfferLabel(item, providerId, { context })

  return (
    <span className={`provider-badge provider-${classId}`} title={offerLabel ? `${provider.label} · ${offerLabel}` : provider.label}>
      <span className="provider-badge-symbol">{provider.short}</span>
      {offerLabel && <span className="provider-offer-tag" aria-label={`Angebotsart ${offerLabel}`}>{offerLabel}</span>}
    </span>
  )
}

export function MovieHubBadge() {
  return <ProviderBadge providerId="moviehub" />
}

export function prioritizeProviderBadges(providerIds = [], {
  includeMovieHub = false,
  maxVisible = MAX_VISIBLE_PROVIDER_BADGES,
} = {}) {
  const requestedLimit = Number.isFinite(maxVisible) ? maxVisible : MAX_VISIBLE_PROVIDER_BADGES
  const totalLimit = Math.max(0, Math.min(MAX_VISIBLE_PROVIDER_BADGES, requestedLimit))
  const availableProviderIds = (Array.isArray(providerIds) ? providerIds : [])
    .filter((providerId) => providerId !== 'moviehub')
    .filter((providerId) => Boolean(providers[providerId]))
  const prioritized = orderProviderIds(availableProviderIds, {
    includeMovieHub: includeMovieHub && Boolean(providers.moviehub),
  })
  return prioritized.slice(0, totalLimit)
}

export default function ProviderBadges({ providerIds, maxVisible = MAX_VISIBLE_PROVIDER_BADGES, includeMovieHub = false, item = null, context = 'title' }) {
  const visibleProviderIds = prioritizeProviderBadges(providerIds, { includeMovieHub, maxVisible })

  if (!visibleProviderIds.length) return null

  return (
    <div className="provider-badges" aria-label="Verfügbare Anbieter">
      {visibleProviderIds.map((providerId) => (
        <ProviderBadge providerId={providerId} item={item} context={context} key={providerId} />
      ))}
    </div>
  )
}
