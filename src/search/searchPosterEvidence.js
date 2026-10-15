import { compactProviderOffers, mergeProviderOffers } from '../providers/providerOfferSnapshot.js'
import { PROVIDER_REGISTRY } from '../providers/providerRegistry.js'

const liveOnlyIds = new Set(PROVIDER_REGISTRY.filter((provider) => provider.liveTvSource).map((provider) => provider.id))

function canonicalKey(item) {
  const type = item?.type === 'series' || item?.mediaType === 'tv' ? 'series' : 'movie'
  const id = Number(item?.tmdbId)
  return Number.isInteger(id) && id > 0 ? type + ':' + id : null
}

function tmdbIds(item) {
  const explicit = Array.isArray(item?.tmdbProviderIds) ? item.tmdbProviderIds : null
  const offers = compactProviderOffers(item)
  return [...new Set([
    ...(explicit || (Array.isArray(item?.providerIds) ? item.providerIds.filter((id) => !liveOnlyIds.has(id) && id !== 'moviehub') : [])),
    ...offers.map((offer) => offer.id),
  ])]
}

/**
 * Enriches the compact search index from the already loaded title catalog.
 * No per-result requests; a verified current TMDB snapshot supersedes stale offers.
 */
export function enrichSearchPosterEntries(entries = [], fullTitles = []) {
  const fullByKey = new Map((Array.isArray(fullTitles) ? fullTitles : [])
    .map((item) => [canonicalKey(item), item])
    .filter(([key]) => key))

  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const full = fullByKey.get(canonicalKey(entry))
    if (!full) return entry

    const authoritative = ['present', 'absent'].includes(full?.metadataChecks?.providers)
      && (Array.isArray(full?.tmdbProviderIds) || Array.isArray(full?.tmdbProviderOffers))
    const offers = authoritative
      ? compactProviderOffers(full)
      : mergeProviderOffers(compactProviderOffers(entry), compactProviderOffers(full))
    const catalogIds = authoritative
      ? tmdbIds(full)
      : [...new Set([...tmdbIds(entry), ...tmdbIds(full)])]
    const tmdbProviderIds = [...new Set([...catalogIds, ...offers.map((offer) => offer.id)])]
    const liveProviderIds = [
      ...Object.keys(full?.liveAvailability || {}),
      ...(Array.isArray(full?.tvLive?.providerIds) ? full.tvLive.providerIds : []),
      ...(full?.waipuLive ? ['waipu'] : []),
      ...(full?.joynLive ? ['joyn'] : []),
    ]
    return {
      ...entry,
      providerIds: [...new Set([...tmdbProviderIds, ...liveProviderIds])],
      tmdbProviderIds,
      tmdbProviderOffers: offers,
      providerOffers: offers,
      ...(full.liveAvailability ? { liveAvailability: full.liveAvailability } : {}),
      ...(full.tvLive ? { tvLive: full.tvLive } : {}),
      ...(full.waipuLive ? { waipuLive: full.waipuLive } : {}),
      ...(full.joynLive ? { joynLive: full.joynLive } : {}),
    }
  })
}
