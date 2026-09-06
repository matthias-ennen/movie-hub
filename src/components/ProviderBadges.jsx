import { providers } from '../data/catalog.js'

export function ProviderBadge({ providerId }) {
  const provider = providers[providerId]
  if (!provider) return null

  return (
    <span className={`provider-badge provider-${providerId}`} title={provider.label}>
      {provider.short}
    </span>
  )
}

export default function ProviderBadges({ providerIds }) {
  return (
    <div className="provider-badges" aria-label="Verfügbare Anbieter">
      {providerIds.map((providerId) => (
        <ProviderBadge providerId={providerId} key={providerId} />
      ))}
    </div>
  )
}
