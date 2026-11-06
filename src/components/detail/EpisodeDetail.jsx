import DetailActions from './DetailActions.jsx'
import DetailLayout from './DetailLayout.jsx'
import TitleDescription from './TitleDescription.jsx'
import { ProviderBadge } from '../ProviderBadges.jsx'
import { providers } from '../../data/catalog.js'
import { episodeNumberLabel } from '../../catalog/episodeContext.js'
import { listDetailTvAirings, formatDetailTvAiring } from '../../tv/detailTvAiring.js'
import { resolveBoundLiveProviderRoutes } from '../../providers/liveProviderRoutes.js'

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
 * Series-wide VOD offers and personal title controls must NOT be represented
 * as episode offers/actions. All TV links are scoped to the selected episode.
 */
export default function EpisodeDetail({
  item, episode, now = Date.now(), titleAirings = null, airingsStatus = null,
  onClose, onOpenAiring, isProviderEnabled = () => true,
}) {
  const date = episodeAirDateLabel(episode.airDate)
  const rating = Number(episode.voteAverage)
  const airings = listDetailTvAirings(item, {
    now, selection: episode, fullAirings: titleAirings,
  })
  const hasStatus = airingsStatus === 'loading' || airingsStatus === 'error'
  const stillUrl = episode?.stillUrl || null
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
                      const provider = providers[providerId]
                      const label = provider.label || providerId
                      return routes[providerId] && onOpenAiring
                        ? <button key={providerId} type="button"
                            className="action-button provider-action" data-focusable="true"
                            aria-label={`${label} für diesen Sendetermin öffnen`}
                            onClick={() => onOpenAiring(airing, providerId)}>
                            <ProviderBadge providerId={providerId} item={providerItem} context="airing" />
                            {label}
                          </button>
                        : <span key={providerId} className="provider-action provider-action-static"
                            aria-label={`${label} für diesen Sendetermin verfügbar`}>
                            <ProviderBadge providerId={providerId} item={providerItem} context="airing" />
                            {label}
                          </span>
                    })}
                  </div>}
                </div>
              )
            })}
          </section>
        : <p className="prototype-note">
            Für diese Folge ist im derzeit bekannten TV-Zeitraum kein Ausstrahlungstermin hinterlegt.
          </p>}
      {episode.tmdbId && <p className="tmdb-credit">Episodendaten: TMDB · ID {episode.tmdbId}</p>}
    </DetailLayout>
  )
}
