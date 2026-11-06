import { providers } from '../../data/catalog.js'
import { ProviderBadge } from '../ProviderBadges.jsx'

/**
 * Identical rendering for the first and every later TV broadcast, including
 * single-episode details. Availability without a concrete playback route
 * remains visible but must not become a non-functional button.
 */
export default function DetailLiveProviderAction({
  providerId, item, canLaunch = false, onOpen, subject = 'diese TV-Ausstrahlung',
}) {
  const provider = providers[providerId]
  if (!provider) return null

  const label = provider.label || providerId
  const contents = <>
    <ProviderBadge providerId={providerId} item={item} context="airing" />
    {label}
  </>

  return canLaunch && typeof onOpen === 'function'
    ? <button type="button" className="action-button provider-action" data-focusable="true"
        aria-label={`${label} für ${subject} öffnen`} onClick={onOpen}>
        {contents}
      </button>
    : <span className="provider-action provider-action-static"
        aria-label={`${label} für ${subject} verfügbar`}>
        {contents}
      </span>
}
