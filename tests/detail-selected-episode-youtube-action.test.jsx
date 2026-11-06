import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DetailModal from '../src/components/DetailModal.jsx'

vi.mock('../src/profiles/ProfileProvider.jsx', () => ({
  useProfiles: () => ({ activeProfile: { id: 'test', displayName: 'Test' } }),
}))
vi.mock('../src/hooks/useAuth.js', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../src/library/LibraryProvider.jsx', () => ({
  useLibrary: () => ({ getTitleState: () => ({ note: '' }), loading: false }),
}))
vi.mock('../src/settings/useProviderSelection.js', () => ({
  useProviderSelection: () => ({
    isProviderEnabled: id => id !== 'disabled', enabledProviderIds: ['youtube', 'waipu'],
  }),
}))
vi.mock('../src/settings/useWaipuStationSelection.js', () => ({
  useWaipuStationSelection: () => ({ disabledStationIds: [] }),
}))
vi.mock('../src/settings/useJoynStationSelection.js', () => ({
  useJoynStationSelection: () => ({ disabledStationIds: [] }),
}))
vi.mock('../src/notifications/useTitleAlerts.js', () => ({
  useTitleAlerts: () => ({ isEnabled: () => false, canWatch: () => true }),
}))
vi.mock('../src/library/sharedMedia.js', () => ({
  loadSharedMedia: vi.fn(), saveSharedMedia: vi.fn(), removeSharedMedia: vi.fn(),
}))

const now = Date.parse('2026-11-06T18:05:00.000Z')
const hint = {
  kind: 'moviehub-youtube-editorial-episode-hint', schemaVersion: 1,
  providerId: 'youtube', seriesTmdbId: 2691, episodeTmdbId: 211788,
  seasonNumber: 1, episodeNumber: 1, videoId: 'aVifdkSQFwY',
  watchUrl: 'https://www.youtube.com/watch?v=aVifdkSQFwY',
  playlistMode: 'rent-buy',
  evidence: 'exact-unique-canonical-episode-title',
  verificationStatus: 'not-independently-verified',
  generatedAt: '2026-11-06T17:35:23.000Z',
  expiresAt: '2026-11-09T17:35:23.000Z',
}
const episode = {
  type: 'episode', seriesTmdbId: 2691, tmdbId: 211788, seasonNumber: 1,
  episodeNumber: 1, title: 'Stur, zwanghaft und unflexibel',
  youtubePlaylistHint: hint,
}
const series = {
  id: 'series-2691', tmdbId: 2691, type: 'series',
  title: 'Two and a Half Men', description: 'Eine Serie',
  availableSeasons: [[1, 24]],
}
const render = (entry = episode, overrides = {}) => renderToStaticMarkup(
  <DetailModal item={{ ...series, detailEpisode: entry, ...overrides }}
    sharedMediaPreloaded initialSharedMedia={[]} initialPrimaryImageUrl={null}
    liveAvailabilityNow={now} onClose={() => {}} />,
)

describe('#717 episode YouTube must reuse the existing streaming provider badge', () => {
  it('shows exactly one standard YouTube provider in Streaming/Mediathek with playlist R&B', () => {
    const view = render()
    const start = view.indexOf('Streaming / Mediathek')
    const youtube = view.indexOf('provider-badge provider-youtube')
    expect(start).toBeGreaterThan(-1)
    expect(youtube).toBeGreaterThan(start)
    expect(view.match(/provider-badge provider-youtube/g)).toHaveLength(1)
    expect(view).toContain('Angebotsart R&amp;B')
    expect(view).not.toContain('YouTube nur für die ausgewählte Folge')
    expect(view).not.toContain('Diese Folge auf YouTube ansehen')
    expect(view).not.toContain('Playlist-Zuordnung; tatsächliche Verfügbarkeit')
  })
  it('keeps existing title-wide YouTube as just ONE badge and prefers episode playlist mode', () => {
    const view = render(episode, { providerIds: ['youtube'], tmdbProviderOffers: [
      {id: 'youtube', offerTypes: ['ads']},
    ] })
    expect(view.match(/provider-badge provider-youtube/g)).toHaveLength(1)
    expect(view).toContain('Angebotsart R&amp;B')
    expect(view).not.toContain('Angebotsart ADS')
  })
  it('never adds an episode-specific badge for other episodes, absent hints or bad IDs', () => {
    for (const other of [
      {...episode, episodeNumber: 2},
      {...episode, tmdbId: 211789},
      {...episode, youtubePlaylistHint: null},
      {...episode, seriesTmdbId: 2692},
    ]) {
      expect(render(other)).not.toContain('provider-badge provider-youtube')
    }
  })
  it('does not add an episode badge for expired or forged links', () => {
    for (const invalid of [
      { ...hint, expiresAt: '2026-11-06T17:34:00.000Z' },
      { ...hint, watchUrl: 'https://www.youtube.com/results?search_query=episode' },
    ]) expect(render({ ...episode, youtubePlaylistHint: invalid }))
      .not.toContain('provider-badge provider-youtube')
  })
})
