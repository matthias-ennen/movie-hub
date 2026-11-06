import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import EpisodeDetail, { episodeAirDateLabel } from '../src/components/detail/EpisodeDetail.jsx'

const now = Date.parse('2026-11-06T10:00:00.000Z')
const item = {
  type: 'series', tmdbId: 4242, title: 'King of Queens',
  description: 'Dies ist die allgemeine Serienbeschreibung – nicht die Folge.',
  providerIds: ['youtube'],
}
const episode = {
  type: 'episode', tmdbId: 12345, seriesTmdbId: 4242,
  title: 'Ein besonderer Tag', description: 'Diese Geschichte gehört nur zur ausgewählten Folge.',
  seasonNumber: 2, episodeNumber: 11, airDate: '2026-11-01',
  runtimeMinutes: 22, voteAverage: 8.3, stillUrl: '/test-still.jpg',
}
const air = (episodeNumber, date, stationId, providerIds = ['waipu']) => ({
  type: 'series', tmdbId: 4242, stationId,
  stationName: stationId === 'rtl' ? 'RTL' : 'PRO7',
  startTime: date, stopTime: new Date(Date.parse(date) + 60 * 60 * 1000).toISOString(),
  episode: { seasonNumber: 2, episodeNumber, title: episodeNumber === 11 ? episode.title : 'Andere Folge' },
  providerIds, playbackRoutes: providerIds.map(providerId => ({
    providerId, mode: 'WEB_LINK', scope: 'channel',
    target: `https://example.org/live/${providerId}/${stationId}`,
  })),
})
const two = [
  air(11, '2026-11-07T12:00:00.000Z', 'rtl', ['waipu', 'joyn']),
  air(11, '2026-11-09T18:00:00.000Z', 'pro7', ['joyn']),
  air(10, '2026-11-08T11:00:00.000Z', 'rtl'),
  air(11, '2026-11-03T12:00:00.000Z', 'rtl'),
]
const html = props => renderToStaticMarkup(<EpisodeDetail item={item} episode={episode}
  now={now} titleAirings={two} airingsStatus="ready" onClose={vi.fn()}
  onOpenAiring={vi.fn()} isProviderEnabled={() => true} {...props} />)

describe('#708 episode detail follows title detail without leaking series evidence', () => {
  it('uses only the selected episode identity, real metadata, image and description', () => {
    const view = html()
    expect(view).toContain('<h2>Ein besonderer Tag</h2>')
    expect(view).toContain('King of Queens')
    expect(view).toContain('Staffel 2 · Folge 11')
    expect(view).toContain('Erstausstrahlung: 1. November 2026')
    expect(view).toContain('22 Min.')
    expect(view).toContain('8,3 / 10')
    expect(view).toContain('/test-still.jpg')
    expect(view).toContain('Diese Geschichte gehört nur zur ausgewählten Folge.')
    expect(view).not.toContain('allgemeine Serienbeschreibung')
    expect(view).not.toContain('Staffeln und Folgen')
    expect(view).not.toContain('Filmreihe')
    expect(view).not.toContain('Streaming / Mediathek')
    expect(view).not.toContain('Favorit')
    expect(view).toContain('Episodendaten: TMDB')
  })

  it('shows all and only future airings for the selected episode, with exact providers', () => {
    const view = html()
    expect(view).toContain('RTL')
    expect(view).toContain('PRO7')
    expect(view).toContain('Samstag, 7. November')
    expect(view).toContain('Montag, 9. November')
    expect(view).not.toContain('Sonntag, 8. November')
    expect(view).not.toContain('Dienstag, 3. November')
    expect(view.match(/class="episode-detail-airing"/g)).toHaveLength(2)
    expect(view.match(/für diesen Sendetermin öffnen/g)).toHaveLength(3)
    expect(view).not.toContain('YouTube')
  })

  it('never creates an enabled button for a disabled provider or missing route', () => {
    const disabled = html({ isProviderEnabled: id => id !== 'joyn' })
    expect(disabled.match(/für diesen Sendetermin öffnen/g)).toHaveLength(1)
    const missingRoute = html({ titleAirings: [ { ...two[0], playbackRoutes: [] } ] })
    expect(missingRoute).not.toContain('für diesen Sendetermin öffnen')
    expect(missingRoute).toContain('für diesen Sendetermin verfügbar')
  })

  it('does not turn a different episode, series VOD, or missing data into an offer', () => {
    const view = html({ titleAirings: [two[2]], airingsStatus: 'ready' })
    expect(view).toContain('kein Ausstrahlungstermin')
    expect(view).not.toContain('RTL')
    expect(view).not.toContain('YouTube')
    const empty = html({ titleAirings: [], episode: {
      ...episode, tmdbId: null, description: '', stillUrl: '', runtimeMinutes: null,
      voteAverage: null, airDate: null,
    } })
    expect(empty).toContain('Für diese Folge liegt noch keine Beschreibung vor.')
    expect(empty).not.toContain('Erstausstrahlung:')
    expect(empty).not.toContain('Episodendaten: TMDB')
    expect(empty).not.toContain('Szenenbild')
  })

  it('retains compact episode preview and an explicit stale-shard fallback message', () => {
    const preview = html({ titleAirings: null, airingsStatus: 'error',
      item: { ...item, liveAvailability: { waipu: { airings: [two[0]] } } } })
    expect(preview).toContain('Vollständige TV-Termine konnten nicht geladen werden')
    expect(preview).toContain('RTL')
  })

  it('accepts only real calendar dates as release metadata', () => {
    expect(episodeAirDateLabel('2026-11-01')).toBe('1. November 2026')
    expect(episodeAirDateLabel('2026-02-30')).toBeNull()
    expect(episodeAirDateLabel(null)).toBeNull()
  })
})


describe('#717 YouTube shortcut is shown through the parent series streaming badge only', () => {
  it('does not introduce a second custom provider button in nested episode details', () => {
    const view = html({ episode: { ...episode, youtubePlaylistHint: {
      kind: 'moviehub-youtube-editorial-episode-hint',
      providerId: 'youtube',
      watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      playlistMode: 'rent-buy',
    } } })
    expect(view).not.toContain('Diese Folge auf YouTube ansehen')
    expect(view).not.toContain('YouTube-Playlist')
    expect(view).not.toContain('Playlist-Zuordnung')
    expect(view).toContain('Episodendaten: TMDB')
  })
})
