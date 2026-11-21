import { resolveProviderPresentation, orderProviderIds } from './providerPresentation.js'
import { providerOfferLabel } from './providerOfferLabels.js'
import { buildDetailLiveProviderEntries, buildDetailStreamingProviderIds } from '../components/detailProviderPresentation.js'

// An entry represents a displayed offer, not a unique provider. The same
// provider can legitimately occur in multiple broadcast or streaming groups.
export function liveOfferEntries(item, airing, providers) {
  const providerItem = { ...item, tvAiring: airing }
  const presentation = resolveProviderPresentation(providerItem, { context: 'airing' })
  return buildDetailLiveProviderEntries(presentation, providers).map(({ providerId }) => ({
    providerId, context: 'airing', offerLabel: providerOfferLabel(providerItem, providerId, { context: 'airing' }),
  }))
}

export function streamingOfferEntries(item, providerIds, providers, {
  hasMovieHub = false, youtubeEpisodeLabel = null,
} = {}) {
  // A mediathek offering must not inherit the AIR label from a different
  // broadcast. The title's own TMDB / verified offer evidence remains intact.
  const titleItem = { ...item, tvAiring: null, liveAvailability: {}, waipuLive: null, joynLive: null }
  return [
    ...(hasMovieHub ? ['moviehub'] : []),
    ...providerIds.filter(id => id !== 'moviehub'),
  ].filter(id => Boolean(providers[id])).map(providerId => ({
    providerId, context: 'title',
    offerLabel: providerId === 'youtube' && youtubeEpisodeLabel
      ? youtubeEpisodeLabel : providerOfferLabel(titleItem, providerId, { context: 'title' }),
  }))
}

// This is the reading order of "Wo anschauen?" on the detail page. Posters
// take a prefix of entries, without a second sort or provider-ID dedupe.
export function buildProviderAvailabilityModel({ item, titleItem = item, airings = [], providers,
  hasMovieHub = false, youtubeEpisodeLabel = null } = {}) {
  const liveGroups = airings.filter(Boolean).map(airing => ({
    airing, entries: liveOfferEntries(item, airing, providers),
  }))
  const liveEntries = liveGroups.flatMap(group => group.entries)
  const titleStreamingProviderIds = buildDetailStreamingProviderIds(
    resolveProviderPresentation(titleItem, { context: 'title' }), providers, liveEntries, titleItem,
  )
  const streamingProviderIds = youtubeEpisodeLabel
    ? orderProviderIds([...titleStreamingProviderIds, 'youtube']) : titleStreamingProviderIds
  const streamingEntries = streamingOfferEntries(titleItem, streamingProviderIds, providers, {
    hasMovieHub, youtubeEpisodeLabel,
  })
  return { liveGroups, liveEntries, titleStreamingProviderIds, streamingProviderIds,
    streamingEntries, entries: [...liveEntries, ...streamingEntries] }
}
