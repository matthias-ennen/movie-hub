import { providers } from '../data/catalog.js'
import { buildProviderAvailabilityModel } from './providerAvailabilityModel.js'
import { listDetailTvAirings } from '../tv/detailTvAiring.js'
import { episodeReference, openingEpisode } from '../catalog/episodeContext.js'
import { navigationEpisode } from '../catalog/episodeResolution.js'
import { selectYoutubeEpisodePlaylistRoute, EPISODE_YOUTUBE_MODE_LABELS } from './youtubeEpisodePlaylistRoute.js'

export const MAX_POSTER_PROVIDERS = 3

// Use only the compact evidence already held by the card. The detail view
// may subsequently learn more from its authoritative title shard.
function posterAirings(item, context, now) {
  const clicked = context === 'airing' ? item?.tvAiring : null
  const liveAvailability = { ...item?.liveAvailability }
  for (const id of ['waipu', 'joyn']) {
    if (!liveAvailability[id] && item?.[`${id}Live`]) liveAvailability[id] = item[`${id}Live`]
  }
  const source = { ...item, liveAvailability, detailAiring: clicked || item?.detailAiring }
  const first = listDetailTvAirings(source, { now })[0]
  // A compact card can provide a selected broadcast without title-level
  // airings. Keep that exact broadcast, never invent another provider.
  if (!first && clicked && (!Number.isFinite(Date.parse(clicked.stopTime)) || Date.parse(clicked.stopTime) > now)) {
    return [clicked]
  }
  const selected = navigationEpisode(episodeReference(first)) || (!first ? openingEpisode(item) : null)
  const airings = listDetailTvAirings(source, { now, selection: selected || undefined })
  return selected?.episodeNumber != null ? airings : airings.slice(0, 1)
}

// Canonical, local-only provider projection shared by every poster surface.
export function resolvePosterProviderModel(item, {
  hasMovieHub = false,
  context = item?.tvAiring ? 'airing' : 'title',
  maxVisible = MAX_POSTER_PROVIDERS,
  now = Date.now(),
} = {}) {
  const airings = posterAirings(item, context, now)
  const episode = openingEpisode(item)
  const youtubeEpisodeRoute = Number(episode?.seriesTmdbId) === Number(item?.tmdbId)
    && providers.youtube ? selectYoutubeEpisodePlaylistRoute(episode?.youtubePlaylistHint, episode, { now }) : null
  const availability = buildProviderAvailabilityModel({ item, airings, providers,
    hasMovieHub: hasMovieHub || item?.movieHubCatalog === true,
    youtubeEpisodeLabel: youtubeEpisodeRoute ? EPISODE_YOUTUBE_MODE_LABELS[youtubeEpisodeRoute.playlistMode] : null,
  })
  const allEntries = availability.entries
  const limit = Number.isFinite(maxVisible) ? Math.max(0, Math.min(MAX_POSTER_PROVIDERS, maxVisible)) : MAX_POSTER_PROVIDERS
  const entries = allEntries.slice(0, limit)
  const providerIds = entries.map(entry => entry.providerId)
  const allProviderIds = allEntries.map(entry => entry.providerId)
  const overflowCount = Math.max(0, allEntries.length - entries.length)

  return {
    entries, allEntries, overflowCount,
    stackDepth: entries.length === MAX_POSTER_PROVIDERS ? Math.min(2, overflowCount) : 0,
    providerIds,
    allProviderIds,
    context,
    includeMovieHub: providerIds.includes('moviehub'),
    // Compatibility for callers inspecting one label per provider; the UI
    // renders ordered entries, since AIR and VOD need distinct labels.
    offerLabels: Object.fromEntries([...entries].reverse().map(entry => [entry.providerId, entry.offerLabel])),
    hasAvailability: allProviderIds.length > 0,
    availabilityVerified: allProviderIds.length > 0
      || item?.metadataChecks?.providers === 'present'
      || item?.metadataChecks?.providers === 'absent',
  }
}
