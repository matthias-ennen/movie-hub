// Compact, verified TMDB offer evidence for poster/view-model publication.
// Never derive an access type from a provider ID alone.
const TYPES = new Set(['free', 'ads', 'flatrate', 'rent', 'buy'])

export function compactProviderOffers(item) {
  const offers = Array.isArray(item?.tmdbProviderOffers) && item.tmdbProviderOffers.length
    ? item.tmdbProviderOffers
    : Array.isArray(item?.providerOffers) ? item.providerOffers : []
  return mergeProviderOffers(offers)
}

export function mergeProviderOffers(...collections) {
  const result = new Map()
  for (const values of collections) {
    for (const value of Array.isArray(values) ? values : []) {
      const id = String(value?.id || '').trim()
      if (!id) continue
      const types = (Array.isArray(value?.offerTypes) ? value.offerTypes : [])
        .filter((type) => TYPES.has(type))
      if (!types.length) continue
      const known = result.get(id) || new Set()
      for (const type of types) known.add(type)
      result.set(id, known)
    }
  }
  return [...result.entries()].map(([id, types]) => ({ id, offerTypes: [...types] }))
}
