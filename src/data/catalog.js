import { PROVIDER_REGISTRY } from '../providers/providerRegistry.js'
import { isProviderEnabledSnapshot } from '../settings/providerSelectionRuntime.js'

export const WAIPU_VOD_URL = 'https://app.waipu.tv/waiputhek'
export const WAIPU_LIVE_URL = 'https://www.waipu.tv/fernsehen/'

export const providerDirectory = Object.fromEntries(PROVIDER_REGISTRY.map((provider) => [
  provider.id,
  {
    label: provider.label,
    short: provider.short,
    source: provider.source,
    searchUrl: provider.searchUrl,
  },
]))

// Bestehende Komponenten greifen weiter über `providers[id]` zu. Der Proxy
// hält diese API stabil, blendet aber konto-weit deaktivierte Anbieter aus.
// Die vollständige Definition bleibt separat über providerDirectory verfügbar.
export const providers = new Proxy(providerDirectory, {
  get(target, property, receiver) {
    if (
      typeof property === 'string'
      && Object.prototype.hasOwnProperty.call(target, property)
      && !isProviderEnabledSnapshot(property)
    ) {
      return undefined
    }
    return Reflect.get(target, property, receiver)
  },
})

/**
 * A provider's own public page is the first, deliberately simple destination.
 * Precise native-app deep links are handled separately, because their support
 * differs between Android, Fire TV and the browser.
 *
 * waipu deliberately uses stable general targets instead of pretending that
 * Movie Hub knows a title-specific contentId. VOD opens the waiputhek; a future
 * live catalog entry uses the general live-TV entry point. It does not pretend
 * that a verified, title-specific waipu deep link exists.
 */
export function getProviderDestination(providerId, title, options = {}) {
  if (providerId === 'waipu' && options?.waipuMode === 'live') {
    return isProviderEnabledSnapshot('waipu') ? WAIPU_LIVE_URL : null
  }

  const provider = providers[providerId]
  if (!provider?.searchUrl || !title) return null
  return provider.searchUrl(title)
}

// Intentionally empty. Movie Hub no longer ships hard-coded demo titles or
// demo rows. Public content must come from the generated /catalog.json; the
// user's personal TMDB/Movie-Hub data is merged independently at runtime.
export const titles = []
export const rowDefinitions = []
