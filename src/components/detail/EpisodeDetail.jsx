import DetailActions from './DetailActions.jsx'
import DetailLayout from './DetailLayout.jsx'
import TitleDescription from './TitleDescription.jsx'
import DetailLiveProviderAction from './DetailLiveProviderAction.jsx'
import StreamingProviderActions from './StreamingProviderActions.jsx'
import { providers } from '../../data/catalog.js'
import { episodeNumberLabel } from '../../catalog/episodeContext.js'
import { listDetailTvAirings, formatDetailTvAiring } from '../../tv/detailTvAiring.js'
import { resolveBoundLiveProviderRoutes } from '../../providers/liveProviderRoutes.js'
import { selectYoutubeEpisodePlaylistRoute } from '../../providers/youtubeEpisodePlaylistRoute.js'
import { orderProviderIds } from '../../providers/providerPresentation.js'

export function episodeAirDateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const date = new Date(value + 'T12:00:00.000Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

/**
 * One canonical episode, shown with the same detail primitives as a title.
 * Show the parent series' known provider destinations for navigation, using an
 * exact episode link when available and the series/search fallback otherwise.
 * TV broadcasts are scoped strictly to the episode; personal states remain title-wide.
 */
export default function EpisodeDetail({
  item, episode, now = Date.now(), titleAirings = null, airingsStatus = null,
  onClose, onOpenAiring, isProviderEnabled = () => true,
  streamingProviderIds = [], titleProviderItem = null, showMovieHubProvider = false,
  onOpenMovieHub = null, movieHubActionLabel = undefined, onOpenStreamingProvider = null,
}) {
  const date = episodeAirDateLabel(episode.airDate)
  const rating = Number(episode.voteAverage)
  const airings = listDetailTvAirings(item, {
    now, selection: episode, fullAirings: titleAirings,
  })
  const hasStatus = airingsStatus === 'loading' || airingsStatus === 'error'
  const stillUrl = episode?.stillUrl || null
  const youtubeEpisodeRoute = Number(episode?.seriesTmdbId) === Number(item?.tmdbId)
    && isProviderEnabled('youtube')
    ? selectYoutubeEpisodePlaylistRoute(episode?.youtubePlaylistHint, episode, { now })
    : null
  const providerIds = youtubeEpisodeRoute
    ? orderProviderIds([...streamingProviderIds, 'youtube'])
    : streamingProviderIds
  const hasStreamingOffers = providerIds.length > 0 || showMovieHubProvider
  return (
    <DetailLayout episode actions={<DetailActions onClose={onClose}
      closeLabel="Folgendetails schließen" />} artwork={
      <div className={stillUrl ? 'episode-detail-art has-image' : 'episode-detail-art'}>
        {stillUrl && <img src={stillUrl} alt={`Szenenbild aus ${episode.title}`}
          loading="lazy" decoding="async" />}
        <span className="episode-detail-type">EPISODE</span>
      </div>}>
      <p className="eyebrow">{item.title}</p>
      <h2>{episode.title}</h2>
      <div className="meta-line episode-detail-meta" aria-label="Folgeninformationen">
        <strong>{episodeNumberLabel(episode)}</strong>
        {date && <span>Erstausstrahlung: {date}</span>}
        {episode.runtimeMinutes > 0 && <span>{episode.runtimeMinutes} Min.</span>}
        {Number.isFinite(rating) && rating > 0 && <span>Bewertung: {rating.toLocaleString('de-DE', {
          maximumFractionDigits: 1,
        })} / 10</span>}
      </div>
      <TitleDescription text={episode.description}
        fallback="Für diese Folge liegt noch keine Beschreibung vor." />

      <h3>Wo anschauen?</h3>
      {hasStatus && <p role="status" className="settings-kicker">
        {airingsStatus === 'loading'
          ? 'Weitere TV-Ausstrahlungstermine werden geladen …'
          : 'Vollständige TV-Termine konnten nicht geladen werden. Die vorhandene Vorschau bleibt verfügbar.'}
      </p>}
      {airings.length > 0
        ? <section className="provider-availability-group" aria-label="TV-Ausstrahlungen dieser Folge">
            <p className="settings-kicker">TV-Ausstrahlung</p>
            {airings.map((airing, index) => {
              const providerItem = { ...item, tvAiring: airing, liveAvailability: {} }
              const providerIds = (Array.isArray(airing.providerIds) ? airing.providerIds : [])
                .filter((id) => providers[id] && isProviderEnabled(id))
              const routes = resolveBoundLiveProviderRoutes(providerItem, providerIds, { now })
              return (
                <div className="episode-detail-airing" key={`${airing.stationId}:${airing.startTime}:${index}`}>
                  <p className="detail-tv-airing">{formatDetailTvAiring(airing)}</p>
                  {providerIds.length > 0 && <div className="provider-actions" aria-label="TV-Anbieter für diesen Termin">
                    {providerIds.map((providerId) => {
                      return <DetailLiveProviderAction key={providerId} providerId={providerId}
                        item={providerItem} canLaunch={Boolean(routes[providerId])}
                        onOpen={onOpenAiring ? () => onOpenAiring(airing, providerId) : null}
                        subject="diesen Sendetermin" />
                    })}
                  </div>}
                </div>
              )
            })}
          </section>
        : <p className="prototype-note">
            Für diese Folge ist im derzeit bekannten TV-Zeitraum kein Ausstrahlungstermin hinterlegt.
          </p>}
      {hasStreamingOffers && (
        <section className="provider-availability-group provider-availability-streaming"
          aria-label="Streaming und Mediathek">
          <p className="settings-kicker">Streaming / Mediathek</p>
          <StreamingProviderActions item={titleProviderItem || item}
            providerIds={providerIds} episode={episode} youtubeEpisodeRoute={youtubeEpisodeRoute}
            showMovieHubProvider={showMovieHubProvider} onOpenMovieHub={onOpenMovieHub}
            movieHubActionLabel={movieHubActionLabel}
            onOpenProvider={onOpenStreamingProvider} />
        </section>
      )}
      {episode.tmdbId && <p className="tmdb-credit">Episodendaten: TMDB · ID {episode.tmdbId}</p>}
    </DetailLayout>
  )
}
