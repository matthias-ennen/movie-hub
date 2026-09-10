export const WAIPU_VOD_URL = 'https://app.waipu.tv/waiputhek'
export const WAIPU_LIVE_URL = 'https://www.waipu.tv/sender/das-erste/'

export const providers = {
  netflix: { label: 'Netflix', short: 'N', searchUrl: (title) => `https://www.netflix.com/search?q=${encodeURIComponent(title)}` },
  prime: { label: 'Prime Video', short: 'P', searchUrl: (title) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(title)}` },
  disney: { label: 'Disney+', short: 'D+', searchUrl: () => 'https://www.disneyplus.com/de-de' },
  youtube: { label: 'YouTube', short: 'YT', searchUrl: (title) => `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}` },
  waipu: { label: 'waipu.tv', short: 'W', searchUrl: () => WAIPU_VOD_URL },
}

/**
 * A provider's own public page is the first, deliberately simple destination.
 * Precise native-app deep links are handled separately, because their support
 * differs between Android, Fire TV and the browser.
 *
 * waipu deliberately uses stable general targets instead of pretending that
 * Movie Hub knows a title-specific contentId. VOD opens the waiputhek; a future
 * live catalog entry can request the stable Das-Erste sender page as the live
 * entry point and let the user switch to the desired channel from there.
 */
export function getProviderDestination(providerId, title, options = {}) {
  if (providerId === 'waipu' && options?.waipuMode === 'live') return WAIPU_LIVE_URL

  const provider = providers[providerId]
  if (!provider?.searchUrl || !title) return null
  return provider.searchUrl(title)
}

// Intentionally empty. Movie Hub no longer ships hard-coded demo titles or
// demo rows. Public content must come from the generated /catalog.json; the
// user's personal TMDB/Movie-Hub data is merged independently at runtime.
export const titles = []
export const rowDefinitions = []
