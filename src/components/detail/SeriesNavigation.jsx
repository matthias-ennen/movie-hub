import { useEffect, useRef, useState } from 'react'
import { loadSeriesSeasonDetail } from '../../catalog/seriesNavigation.js'
import { episodeNumberLabel, matchingEpisode } from '../../catalog/episodeContext.js'
import DetailDialog from './DetailDialog.jsx'
import DetailActions, { DialogHeading } from './DetailActions.jsx'
import DetailLayout from './DetailLayout.jsx'
import DetailCard from './DetailCard.jsx'

export default function SeriesNavigation({ item, seasons, selectedSeason, initialEpisode, onSelectSeason }) {
  const [picker, setPicker] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedEpisode, setSelectedEpisode] = useState(initialEpisode)
  const [episode, setEpisode] = useState(null)
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])

  function chooseSeason(season) {
    if (selectedSeason?.seasonNumber !== season.seasonNumber) {
      request.current += 1
      onSelectSeason(season.seasonNumber)
      setSelectedEpisode(null)
      setDetail(null)
      setMessage('')
    }
    setPicker(null)
  }

  async function showEpisodes() {
    if (!selectedSeason) return
    setPicker('episodes')
    if (detail?.seasonNumber === selectedSeason.seasonNumber) return
    const id = ++request.current
    setLoading(true)
    setMessage('')
    try {
      const loaded = await loadSeriesSeasonDetail(item, selectedSeason)
      if (request.current !== id) return
      setDetail(loaded)
      const matched = matchingEpisode(loaded.episodes, selectedEpisode)
      if (matched) setSelectedEpisode(matched)
      else if (selectedEpisode?.episodeNumber != null) {
        setMessage('Die angegebene Folge ist in dieser Staffel nicht enthalten. Bitte wähle eine Folge aus.')
      }
    } catch (error) {
      if (request.current === id) setMessage(error?.message || 'Folgendaten konnten nicht geladen werden.')
    } finally {
      if (request.current === id) setLoading(false)
    }
  }

  const current = matchingEpisode(detail?.episodes || [], selectedEpisode)
  const episodeLabel = selectedEpisode?.episodeNumber != null
    ? `Folge ${selectedEpisode.episodeNumber}${selectedEpisode.title ? ` · ${selectedEpisode.title}` : ''}`
    : selectedEpisode?.title || 'Folge auswählen'

  return <>
    <DetailCard className="series-navigation-summary" id="series-navigation-heading" title="Staffeln und Folgen">
      <button type="button" className="series-selection-field" data-focusable="true"
        disabled={!seasons.length} aria-haspopup="dialog" onClick={() => setPicker('seasons')}>
        <span>Staffel</span><strong>{selectedSeason ? `Staffel ${selectedSeason.seasonNumber}`
          : initialEpisode?.seasonNumber != null ? `Staffel ${initialEpisode.seasonNumber} · nicht verfügbar`
            : seasons.length ? 'Staffel auswählen' : 'Keine Staffeldaten verfügbar'}</strong>
        <span aria-hidden="true">⌄</span>
      </button>
      <button type="button" className="series-selection-field" data-focusable="true"
        disabled={!selectedSeason} aria-haspopup="dialog" onClick={showEpisodes}>
        <span>Folge</span><strong>{episodeLabel}</strong><span aria-hidden="true">›</span>
      </button>
    </DetailCard>

    {picker === 'seasons' && <DetailDialog className="media-panel detail-selection-panel"
      labelledBy="season-picker-heading" onClose={() => setPicker(null)}
      initialFocus={selectedSeason ? '[aria-pressed="true"]' : '[data-season-option]'}>
      <DialogHeading id="season-picker-heading" onClose={() => setPicker(null)} subtitle={item.title}>Staffel auswählen</DialogHeading>
      <div className="season-picker-list">
        {seasons.map((season) => <button type="button" key={season.id} className="series-selection-field"
          data-focusable="true" data-season-option="true" aria-pressed={season.seasonNumber === selectedSeason?.seasonNumber}
          onClick={() => chooseSeason(season)}>
          <strong>Staffel {season.seasonNumber}</strong>
          <span>{season.episodeCount != null ? `${season.episodeCount} Folgen` : ''}</span>
        </button>)}
      </div>
    </DetailDialog>}

    {picker === 'episodes' && <DetailDialog className="media-panel collection-panel episodes-panel"
      labelledBy="episodes-picker-heading" onClose={() => { setEpisode(null); setPicker(null) }}
      initialFocus={current ? '[aria-current="true"]' : '[data-episode-option]'} focusReady={!loading} busy={loading}>
      <DialogHeading id="episodes-picker-heading" onClose={() => setPicker(null)}
        subtitle={`${item.title} · ${detail?.episodes.length ?? selectedSeason.episodeCount ?? '–'} Folgen`}>
        Staffel {selectedSeason.seasonNumber}
      </DialogHeading>
      {loading && <p role="status" className="episodes-status">Folgen werden geladen …</p>}
      {!loading && message && <p role="status" className="episodes-status">{message}</p>}
      {!loading && !detail && <button type="button" className="action-button" data-focusable="true" onClick={showEpisodes}>Erneut versuchen</button>}
      {!loading && detail?.episodes.length === 0 && <p role="status" className="episodes-status">Für diese Staffel sind keine Folgen verfügbar.</p>}
      {!loading && detail?.episodes.length > 0 && <div className="episode-grid" aria-label={`Folgen von Staffel ${selectedSeason.seasonNumber}`}>
        {detail.episodes.map((entry) => <button type="button" key={entry.id}
          className={`episode-card${entry.id === current?.id ? ' current' : ''}`}
          data-focusable="true" data-episode-option="true" aria-current={entry.id === current?.id ? 'true' : undefined}
          aria-label={`${episodeNumberLabel(entry)}: ${entry.title}`}
          onClick={() => { setSelectedEpisode(entry); setEpisode(entry) }}>
          <span className={entry.stillUrl ? 'episode-still has-image' : 'episode-still'}>
            {entry.stillUrl && <img src={entry.stillUrl} alt="" loading="lazy" />}
            <span>Folge {entry.episodeNumber}</span>
          </span>
          <span className="episode-copy"><strong>{entry.title}</strong>
            <small>{entry.airDate || 'Ausstrahlungsdatum unbekannt'}</small>
            <span>{entry.description || 'Keine Beschreibung verfügbar.'}</span>
          </span>
        </button>)}
      </div>}
    </DetailDialog>}

    {episode && <DetailDialog className="media-panel episode-detail-panel detail-layout-panel" label={`Details zu ${episode.title}`}
      backdropClassName="media-layer detail-backdrop episode-detail-layer" onClose={() => setEpisode(null)}>
      <DetailLayout episode actions={<DetailActions onClose={() => setEpisode(null)} />} artwork={
      <div className={episode.stillUrl ? 'episode-detail-art has-image' : 'episode-detail-art'}>
        {episode.stillUrl && <img src={episode.stillUrl} alt="" />}
        <span className="episode-detail-type">EPISODE</span>
      </div>}>
        <p className="eyebrow">{item.title}</p>
        <h2>{episode.title}</h2>
        <div className="episode-detail-meta"><strong>{episodeNumberLabel(episode)}</strong>
          {episode.airDate && <span>{episode.airDate}</span>}
          {episode.runtimeMinutes && <span>{episode.runtimeMinutes} Min.</span>}
        </div>
        <p className="episode-detail-description">{episode.description || 'Für diese Folge liegt noch keine deutsche Beschreibung vor.'}</p>
      </DetailLayout>
    </DetailDialog>}
  </>
}
