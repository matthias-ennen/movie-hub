export const YOUTUBE_CURATED_TITLE_HINTS_URL = '/youtube-curated-title-hints.json'
let cached = null
export function loadYoutubeCuratedTitleHints(request = fetch) {
  if (request === fetch && cached) return cached
  const pending = Promise.resolve().then(() => request(YOUTUBE_CURATED_TITLE_HINTS_URL, { redirect: 'error' }))
    .then(async response => {
      if (!response?.ok) return null
      const data = await response.json()
      if (data?.kind !== 'moviehub-youtube-curated-editorial-title-hints') return null
      if (data.schemaVersion !== 1 || data.providerId !== 'youtube') return null
      if (data.publicationAuthority !== 'editorial-playlist-only') return null
      if (data.verifiedDEOffers !== 0 || data.verifiedPlaybackRoutes !== 0) return null
      return Array.isArray(data.entries) && data.count === data.entries.length ? data : null
    }).catch(() => null)
  if (request === fetch) cached = pending
  return pending
}
