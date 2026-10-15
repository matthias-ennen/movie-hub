// A display label is not a replacement for the underlying offer types.
// Multiple TMDB offers stay available to notification checks and detail pages.
const OFFER_TYPES = new Set(['flatrate', 'free', 'ads', 'rent', 'buy'])

export function labelForOfferTypes(values = []) {
  const types = new Set((Array.isArray(values) ? values : []).filter((value) => OFFER_TYPES.has(value)))
  if (types.has('free')) return 'FREE'
  if (types.has('flatrate')) return 'FLAT'
  if (types.has('ads')) return 'ADS'
  if (types.has('rent') && types.has('buy')) return 'R&B'
  if (types.has('rent')) return 'RENT'
  if (types.has('buy')) return 'BUY'
  return null
}

function tmdbOffers(item) {
  return Array.isArray(item?.tmdbProviderOffers) ? item.tmdbProviderOffers
    : Array.isArray(item?.providerOffers) ? item.providerOffers : []
}

export function providerOfferLabel(item, providerId, { context = 'title' } = {}) {
  if (!providerId) return null
  if (providerId === 'moviehub') return 'FREE'

  const exactAiring = item?.tvAiring
  const airedBy = exactAiring?.providerIds || (exactAiring?.source ? [exactAiring.source] : [])
  if (context === 'airing' && (Array.isArray(airedBy) && airedBy.includes(providerId))) return 'AIR'

  const offer = tmdbOffers(item).find((entry) => entry?.id === providerId)
  const streaming = labelForOfferTypes(offer?.offerTypes)
  if (streaming) return streaming

  // A title may have a later Joyn programme while the selected TV card is a
  // Waipu broadcast. Such title-wide airings must not label Joyn AIR here.
  if (context === 'airing' && exactAiring) return null

  const live = item?.liveAvailability?.[providerId]
    || (providerId === 'waipu' ? item?.waipuLive : providerId === 'joyn' ? item?.joynLive : null)
  const hasFutureAirings = Array.isArray(live?.airings) ? live.airings.length > 0 : Boolean(live?.nextAiring)
  if (hasFutureAirings) return 'AIR'

  if (context === 'airing' && Array.isArray(airedBy) && airedBy.includes(providerId)) return 'AIR'
  // An old provider ID alone is not proof of a specific access type.
  return null
}
