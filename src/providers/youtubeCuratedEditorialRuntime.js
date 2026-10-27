export const YOUTUBE_CURATED_TITLE_HINTS_URL = '/youtube-curated-title-hints.json'
export function loadYoutubeCuratedTitleHints(request = fetch) {
  const pending = Promise.resolve().then(() => request(YOUTUBE_CURATED_TITLE_HINTS_URL, { redirect: 'error', cache: 'no-store' }))
    .then(async response => {
      if (!response?.ok) return null
      const data = await response.json()
      if (data?.kind !== 'moviehub-youtube-curated-editorial-title-hints') return null
      if (data.schemaVersion !== 1 || data.providerId !== 'youtube') return null
      if (data.publicationAuthority !== 'editorial-playlist-only') return null
      if (data.verifiedDEOffers !== 0 || data.verifiedPlaybackRoutes !== 0) return null
      return Array.isArray(data.entries) && data.count === data.entries.length ? data : null
    }).catch(() => null)
  return pending
}
