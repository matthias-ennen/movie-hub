import { providerDirectory, providers } from '../data/catalog.js'
import { orderProviderIds } from '../providers/providerPresentation.js'
import { providerOfferLabel } from '../providers/providerOfferLabels.js'
import { resolvePosterProviderModel } from '../providers/posterProviderModel.js'

export const MAX_VISIBLE_PROVIDER_BADGES = 3

export function ProviderBadge({ providerId, item = null, context = 'title', resolvedOfferLabel = undefined }) {
  const provider = providerDirectory[providerId]
  if (!provider) return null
  const classId = providerId === 'moviehub' ? 'movie-hub' : providerId
  const provisional = providerId === 'youtube'
    && item?.curatedPlaylistTitleOffer?.provenance === 'playlist-declared-not-verified'
    && !item?.verifiedTitleOffers?.some((o) => o.id === 'youtube')
  const offerLabel = resolvedOfferLabel === undefined
    ? providerOfferLabel(item, providerId, { context }) : resolvedOfferLabel

  return (
    <span className={`provider-badge provider-${classId}`} title={provisional ? `${provider.label} · ${offerLabel} · Nur Playlist-Zuordnung, Verfügbarkeit ungeprüft`
      : offerLabel ? `${provider.label} · ${offerLabel}` : provider.label}>
      <span className="provider-badge-symbol">{provider.short}</span>
      {offerLabel && <span className="provider-offer-tag" aria-label={provisional ? `Playlist-Einstufung ${offerLabel}, noch nicht unabhängig geprüft` : `Angebotsart ${offerLabel}`}>{offerLabel}</span>}
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

export default function ProviderBadges({
  providerIds = null, maxVisible = MAX_VISIBLE_PROVIDER_BADGES,
  includeMovieHub = false, item = null, context = undefined, model = null,
}) {
  const resolved = model || (item && !Array.isArray(providerIds)
    ? resolvePosterProviderModel(item, { hasMovieHub: includeMovieHub, context, maxVisible })
    : null)
  const entries = resolved?.entries || prioritizeProviderBadges(providerIds, { includeMovieHub, maxVisible })
    .map(providerId => ({ providerId, context: context || 'title' }))
  if (!entries.length) return null
  const stackDepth = resolved?.stackDepth || 0
  const overflow = resolved?.overflowCount || 0

  return (
    <div className={stackDepth ? 'provider-badges provider-badges-stacked' : 'provider-badges'} aria-label={overflow ? 'Verfügbare Anbieter, weitere Angebote in den Details' : 'Verfügbare Anbieter'}>
      {entries.map((entry, index) => {
        const badge = <ProviderBadge providerId={entry.providerId} item={item}
          context={entry.context} resolvedOfferLabel={entry.offerLabel} />
        const key = `${entry.context}:${entry.providerId}:${index}`
        return index === 2 && stackDepth > 0
          ? <span key={key} className="provider-badge-stack" data-stack-depth={stackDepth}>
              {badge}
            </span>
          : <ProviderBadge key={key} providerId={entry.providerId} item={item}
              context={entry.context} resolvedOfferLabel={entry.offerLabel} />
      })}
    </div>
  )
}
