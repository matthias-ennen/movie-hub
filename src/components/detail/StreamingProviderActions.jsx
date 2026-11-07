import { providers } from '../../data/catalog.js'
import { ProviderBadge } from '../ProviderBadges.jsx'
import { TITLE_ROUTE_EVIDENCE } from '../../providers/titleProviderRouteEnrichment.js'
import { EPISODE_YOUTUBE_MODE_LABELS } from '../../providers/youtubeEpisodePlaylistRoute.js'

/**
 * One provider-action presentation for both title and nested episode details.
 * A provider's presence is independent of the precision of its launch route:
 * the parent controller chooses the best available episode/title/search link.
 */
export default function StreamingProviderActions({
  item, providerIds = [], episode = null, youtubeEpisodeRoute = null,
  showMovieHubProvider = false, onOpenMovieHub = null,
  movieHubActionLabel = 'Eigene Movie-Hub-Links und Videos auswählen',
  onOpenProvider,
}) {
  return (
    <div className="provider-actions" aria-label="Streaming- und Mediathek-Anbieter">
      {showMovieHubProvider && (
        <button type="button" className="action-button provider-action movie-hub-action"
          data-focusable="true" onClick={onOpenMovieHub} aria-label={movieHubActionLabel}>
          <ProviderBadge providerId="moviehub" item={item} />
          Movie Hub
        </button>
      )}
      {providerIds.map((providerId) => {
        const provider = providers[providerId]
        if (!provider) return null
        const possibleYoutubeLink = providerId === 'youtube'
          && item?.titleProviderRouteEvidence?.youtube?.source === TITLE_ROUTE_EVIDENCE.BEST_EFFORT
        const selectedYoutube = providerId === 'youtube' && youtubeEpisodeRoute
        return (
          <button type="button" key={providerId}
            className="action-button provider-action" data-focusable="true"
            onClick={() => onOpenProvider?.(providerId, episode)}
            aria-label={selectedYoutube
              ? `YouTube für Staffel ${episode?.seasonNumber}, Folge ${episode?.episodeNumber} öffnen`
              : providerId === 'youtube' && item?.curatedPlaylistTitleOffer
                ? 'YouTube-Playlist-Link öffnen (Playlist-Klasse '
                  + (item.curatedPlaylistTitleOffer.playlistMode === 'free' ? 'FREE' : 'R&B')
                  + '; Filmfassung und Wiedergabe nicht unabhängig bestätigt)'
                : possibleYoutubeLink
                  ? 'Möglichen YouTube-Filmtreffer öffnen (Zuordnung und Wiedergabe nicht garantiert)'
                  : `${provider.label} als Streaming- oder Mediathek-Anbieter öffnen`}>
            <ProviderBadge providerId={providerId} item={item} context="title"
              resolvedOfferLabel={selectedYoutube
                ? EPISODE_YOUTUBE_MODE_LABELS[youtubeEpisodeRoute.playlistMode]
                : undefined} />
            {provider.label}
          </button>
        )
      })}
    </div>
  )
}
