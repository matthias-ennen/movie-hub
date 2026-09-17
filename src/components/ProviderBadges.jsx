import { providerDirectory, providers } from '../data/catalog.js'

export const MAX_VISIBLE_PROVIDER_BADGES = 3

export function ProviderBadge({ providerId }) {
  const provider = providerDirectory[providerId]
  if (!provider) return null
  const classId = providerId === 'moviehub' ? 'movie-hub' : providerId

  return (
    <span className={`provider-badge provider-${classId}`} title={provider.label}>
      {provider.short}
    </span>
  )
}

export function MovieHubBadge() {
  return <ProviderBadge providerId="moviehub" />
}

export default function ProviderBadges({ providerIds, maxVisible = MAX_VISIBLE_PROVIDER_BADGES, includeMovieHub = false }) {
  const requestedLimit = Number.isFinite(maxVisible) ? maxVisible : MAX_VISIBLE_PROVIDER_BADGES
  const totalLimit = Math.max(0, Math.min(MAX_VISIBLE_PROVIDER_BADGES, requestedLimit))
  const automaticLimit = Math.max(0, totalLimit - (includeMovieHub ? 1 : 0))
  const visibleProviderIds = providerIds
    .filter((providerId) => providerId !== 'moviehub')
    .filter((providerId) => Boolean(providers[providerId]))
    .slice(0, automaticLimit)

  if (!includeMovieHub && !visibleProviderIds.length) return null

  return (
    <div className="provider-badges" aria-label="Verfügbare Anbieter">
      {includeMovieHub && totalLimit > 0 && <MovieHubBadge />}
      {visibleProviderIds.map((providerId) => (
        <ProviderBadge providerId={providerId} key={providerId} />
      ))}
    </div>
  )
}
