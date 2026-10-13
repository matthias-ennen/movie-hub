import { useEffect, useRef, useState } from 'react'
import { loadSeriesSeasonDetail } from '../../catalog/seriesNavigation.js'
import { episodeNumberLabel, matchingEpisode } from '../../catalog/episodeContext.js'
import DetailDialog from './DetailDialog.jsx'
import DetailActions, { DialogHeading } from './DetailActions.jsx'
import DetailLayout from './DetailLayout.jsx'
import DetailCard from './DetailCard.jsx'

export default function SeriesNavigation({ item, seasons, selectedSeason, selectedEpisode, onSelectEpisode, onSelectSeason, onBeginNavigation }) {
  const [picker, setPicker] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [episode, setEpisode] = useState(null)
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])

  function chooseSeason(season) {
    if (selectedSeason?.seasonNumber !== season.seasonNumber) {
      request.current += 1
      onSelectSeason(season.seasonNumber)
      setDetail(null)
    }
    setPicker(null)
  }

  async function showEpisodes() {
    if (!selectedSeason) return
    onBeginNavigation?.()
    setPicker('episodes')
    if (detail?.seasonNumber === selectedSeason.seasonNumber) return
    const id = ++request.current
    setLoading(true)
    try {
      const loaded = await loadSeriesSeasonDetail(item, selectedSeason)
      if (request.current !== id) return
      setDetail(loaded)
    } catch {
      if (request.current === id) setDetail(null)
    } finally {
      if (request.current === id) setLoading(false)
    }
  }

  const current = matchingEpisode(detail?.episodes || [], selectedEpisode)
  const displayEpisode = selectedSeason && (!selectedEpisode?.resolution || selectedEpisode.resolution === 'matched')
    ? selectedEpisode : null
  const episodeLabel = displayEpisode?.episodeNumber != null
    ? `Folge ${displayEpisode.episodeNumber}${displayEpisode.title ? ` · ${displayEpisode.title}` : ''}`
    : 'Folge auswählen'

  return <>
    <DetailCard className="series-navigation-summary" id="series-navigation-heading" title="Staffeln und Folgen">
      <button type="button" className="series-selection-field" data-focusable="true"
        disabled={!seasons.length} aria-haspopup="dialog" onClick={() => { onBeginNavigation?.(); setPicker('seasons') }}>
        <span>Staffel</span><strong>{selectedSeason ? `Staffel ${selectedSeason.seasonNumber}` : 'Staffel auswählen'}</strong>
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
      <DialogHeading id="episodes-picker-heading" onClose={() => setPicker(null)} floatingClose
        subtitle={`${item.title} · ${detail?.episodes.length ?? selectedSeason.episodeCount ?? '–'} Folgen`}>
        Staffel {selectedSeason.seasonNumber}
      </DialogHeading>
      {!loading && !detail && <button type="button" className="action-button" data-focusable="true" onClick={showEpisodes}>Erneut versuchen</button>}
      {!loading && detail?.episodes.length > 0 && <div className="episode-grid" aria-label={`Folgen von Staffel ${selectedSeason.seasonNumber}`}>
        {detail.episodes.map((entry) => <button type="button" key={entry.id}
          className={`episode-card${entry.id === current?.id ? ' current' : ''}`}
          data-focusable="true" data-episode-option="true" aria-current={entry.id === current?.id ? 'true' : undefined}
          aria-label={`${episodeNumberLabel(entry)}: ${entry.title}`}
          onClick={() => { onSelectEpisode(entry); setEpisode(entry) }}>
          <span className={entry.stillUrl ? 'episode-still has-image' : 'episode-still'}>
            {entry.stillUrl && <img src={entry.stillUrl} alt="" loading="lazy" />}
            <span>Folge {entry.episodeNumber}</span>
          </span>
          <span className="episode-copy"><strong>{entry.title}</strong>
            {entry.airDate && <small>{entry.airDate}</small>}
            {entry.description && <span>{entry.description}</span>}
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
        {episode.description && <p className="episode-detail-description">{episode.description}</p>}
      </DetailLayout>
    </DetailDialog>}
  </>
}
