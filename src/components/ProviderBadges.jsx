import { providerDirectory, providers } from '../data/catalog.js'

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

export default function ProviderBadges({ providerIds, maxVisible = Number.POSITIVE_INFINITY, includeMovieHub = false }) {
  const automaticLimit = Number.isFinite(maxVisible)
    ? Math.max(0, maxVisible - (includeMovieHub ? 1 : 0))
    : maxVisible
  const visibleProviderIds = providerIds
    .filter((providerId) => providerId !== 'moviehub')
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
