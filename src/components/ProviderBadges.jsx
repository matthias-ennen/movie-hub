import { providerDirectory, providers } from '../data/catalog.js'

export function ProviderBadge({ providerId }) {
  const provider = providerDirectory[providerId]
  if (!provider) return null

  return (
    <span className={`provider-badge provider-${providerId}`} title={provider.label}>
      {provider.short}
    </span>
  )
}

export function MovieHubBadge() {
  return (
    <span className="provider-badge provider-movie-hub" title="Movie Hub">
      MH
    </span>
  )
}

export default function ProviderBadges({ providerIds, maxVisible = Number.POSITIVE_INFINITY, includeMovieHub = false }) {
  const automaticLimit = Number.isFinite(maxVisible)
    ? Math.max(0, maxVisible - (includeMovieHub ? 1 : 0))
    : maxVisible
  const visibleProviderIds = providerIds
    .filter((providerId) => Boolean(providers[providerId]))
    .slice(0, automaticLimit)

  if (!includeMovieHub && !visibleProviderIds.length) return null

  return (
    <div className="provider-badges" aria-label="Verfügbare Anbieter">
      {includeMovieHub && <MovieHubBadge />}
      {visibleProviderIds.map((providerId) => (
        <ProviderBadge providerId={providerId} key={providerId} />
      ))}
    </div>
  )
}
