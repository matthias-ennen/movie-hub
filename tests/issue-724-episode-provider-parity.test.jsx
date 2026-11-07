import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import EpisodeDetail from '../src/components/detail/EpisodeDetail.jsx'

const now = Date.parse('2026-11-07T10:00:00.000Z')
const item = {
  tmdbId: 2691, type: 'series', title: 'Beispielserie',
  tmdbProviderOffers: [
    { id: 'netflix', offerTypes: ['flatrate'] },
    { id: 'youtube', offerTypes: ['rent'] },
  ],
}
const episode = {
  type: 'episode', tmdbId: 211788, seriesTmdbId: 2691,
  seasonNumber: 1, episodeNumber: 1, title: 'Erste Folge',
}
const exactYoutubeHint = {
  kind: 'moviehub-youtube-editorial-episode-hint', schemaVersion: 1,
  providerId: 'youtube', seriesTmdbId: 2691, episodeTmdbId: 211788,
  seasonNumber: 1, episodeNumber: 1, videoId: 'abcdefghijk',
  watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  playlistMode: 'rent-buy', evidence: 'exact-unique-canonical-episode-title',
  verificationStatus: 'not-independently-verified',
  generatedAt: '2026-11-07T09:00:00.000Z',
  expiresAt: '2026-11-10T09:00:00.000Z',
}
const html = (overrides = {}) => renderToStaticMarkup(<EpisodeDetail
  item={item} episode={episode} now={now}
  titleAirings={[]} airingsStatus="ready" onClose={vi.fn()}
  streamingProviderIds={['netflix', 'youtube']} titleProviderItem={item}
  onOpenStreamingProvider={vi.fn()} isProviderEnabled={() => true}
  {...overrides}
/>)

describe('#724 episode detail shares canonical series provider actions', () => {
  it('keeps Netflix and YouTube when no precise episode route exists', () => {
    const view = html()
    expect(view).toContain('Streaming / Mediathek')
    expect(view).toContain('provider-badge provider-netflix')
    expect(view).toContain('provider-badge provider-youtube')
    expect(view.match(/provider-badge provider-netflix/g)).toHaveLength(1)
    expect(view.match(/provider-badge provider-youtube/g)).toHaveLength(1)
    expect(view).toContain('Netflix als Streaming- oder Mediathek-Anbieter öffnen')
    expect(view).toContain('kein Ausstrahlungstermin')
  })

  it('prefers the typed exact YouTube episode shortcut without adding another badge', () => {
    const view = html({ episode: { ...episode, youtubePlaylistHint: exactYoutubeHint } })
    expect(view.match(/provider-badge provider-youtube/g)).toHaveLength(1)
    expect(view).toContain('Angebotsart R&amp;B')
    expect(view).toContain('YouTube für Staffel 1, Folge 1 öffnen')
    expect(view).toContain('provider-badge provider-netflix')
  })

  it('preserves the series-level YouTube provider when the episode hint expires', () => {
    const view = html({ episode: { ...episode, youtubePlaylistHint: {
      ...exactYoutubeHint, expiresAt: '2026-11-07T09:00:00.000Z',
    } } })
    expect(view.match(/provider-badge provider-youtube/g)).toHaveLength(1)
    expect(view).not.toContain('YouTube für Staffel 1, Folge 1 öffnen')
    expect(view).toContain('provider-badge provider-netflix')
  })

  it('adds an exact episode provider even if there was no title-level YouTube offer', () => {
    const view = html({ streamingProviderIds: ['netflix'], episode: {
      ...episode, youtubePlaylistHint: exactYoutubeHint,
    } })
    expect(view.match(/provider-badge provider-youtube/g)).toHaveLength(1)
    expect(view.match(/provider-badge provider-netflix/g)).toHaveLength(1)
  })

  it('respects disabled providers and retains actual personal media destinations', () => {
    const view = html({
      isProviderEnabled: id => id !== 'netflix',
      showMovieHubProvider: true,
      onOpenMovieHub: vi.fn(),
    })
    expect(view).not.toContain('provider-badge provider-netflix')
    expect(view).toContain('provider-badge provider-youtube')
    expect(view).toContain('provider-badge provider-movie-hub')
  })
})
