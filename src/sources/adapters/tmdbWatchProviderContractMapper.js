import { normalizeAvailability } from '../sourceAdapterContract.js'

function safeText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export function mapTmdbProviderOffersToAvailabilities(title, {
  sourceId = 'tmdb-watch-providers',
  region = 'DE',
  observedAt = new Date().toISOString(),
} = {}) {
  const mediaType = title?.type === 'series' || title?.mediaType === 'tv' ? 'series' : 'movie'
  const tmdbId = Number(title?.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return []

  const link = safeText(title?.watchProviderLink)
  const availabilities = []

  for (const offer of Array.isArray(title?.providerOffers) ? title.providerOffers : []) {
    const providerId = safeText(offer?.id)
    if (!providerId) continue

    for (const accessType of Array.isArray(offer?.offerTypes) ? offer.offerTypes : []) {
      if (!['flatrate', 'free', 'ads', 'rent', 'buy'].includes(accessType)) continue

      availabilities.push(normalizeAvailability({
        availabilityId: [
          sourceId,
          mediaType,
          tmdbId,
          providerId,
          accessType,
          String(region || 'DE').toUpperCase(),
        ].join(':'),
        titleRef: { mediaType, tmdbId },
        providerId,
        region,
        accessType,
        playbackRoutes: link ? [{
          providerId,
          mode: 'WEB_LINK',
          target: link,
        }] : [],
        sourceRefs: [{
          sourceId,
          externalId: Number.isFinite(Number(offer?.tmdbProviderId))
            ? String(Number(offer.tmdbProviderId))
            : providerId,
          observedAt,
        }],
        extensions: {
          tmdb: {
            tmdbProviderId: Number.isFinite(Number(offer?.tmdbProviderId))
              ? Number(offer.tmdbProviderId)
              : null,
            watchProviderLink: link,
          },
        },
      }))
    }
  }

  return availabilities
}
