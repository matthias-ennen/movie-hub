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

export default function ProviderBadges({ providerIds }) {
  const visibleProviderIds = providerIds.filter((providerId) => Boolean(providers[providerId]))
  if (!visibleProviderIds.length) return null

  return (
    <div className="provider-badges" aria-label="Verfügbare Anbieter">
      {visibleProviderIds.map((providerId) => (
        <ProviderBadge providerId={providerId} key={providerId} />
      ))}
    </div>
  )
}
