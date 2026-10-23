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

  // When the exact YouTube video comes from a user-curated playlist, the
  // displayed offer classification must describe THAT selected source video.
  // TMDB may independently report e.g. ADS for the same movie as a whole.
  // Neither value proves the offer on the other source's video URL.
  // Verified SourceEnvelope offers cannot also carry this provisional hint.
  if (providerId === 'youtube' &&
    item?.curatedPlaylistTitleOffer?.id === 'youtube' &&
    item.curatedPlaylistTitleOffer.provenance === 'playlist-declared-not-verified' &&
    !item?.verifiedTitleOffers?.some((entry) => entry?.id === 'youtube')) {
    if (item.curatedPlaylistTitleOffer.playlistMode === 'free') return 'FREE'
    if (item.curatedPlaylistTitleOffer.playlistMode === 'rent-buy') return 'R&B'
  }

  const offer = tmdbOffers(item).find((entry) => entry?.id === providerId)
  const streaming = labelForOfferTypes(offer?.offerTypes)
  if (streaming) return streaming

  // TMDB evidence wins where it exists. An independently verified YouTube-only
  // offer may contribute its own label without modifying tmdbProviderOffers.
  const independentlyVerified = (Array.isArray(item?.verifiedTitleOffers)
    ? item.verifiedTitleOffers : []).find((entry) => entry?.id === providerId)
  const verifiedLabel = labelForOfferTypes(independentlyVerified?.offerTypes)
  if (verifiedLabel) return verifiedLabel

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
