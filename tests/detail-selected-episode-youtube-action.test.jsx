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

describe('#717 episode-scoped YouTube action visible at main series detail after selection', () => {
  it('renders one directly launchable YouTube badge above TV airings, not a series-wide offer', () => {
    const view = render()
    expect(view).toContain('YouTube nur für die ausgewählte Folge')
    expect(view).toContain('Staffel 1')
    expect(view).toContain('Folge 1')
    expect(view).toContain('Diese Folge auf YouTube ansehen')
    expect(view).toContain('provider-badge provider-youtube')
    expect(view).toContain('noch nicht unabhängig bestätigt')
    expect(view.indexOf('Diese Folge auf YouTube ansehen'))
      .toBeLessThan(view.indexOf('TV-Ausstrahlung'))
  })
  it('never leaks an episode shortcut to another episode or missing hint', () => {
    expect(render({ ...episode, episodeNumber: 2 })).not.toContain('Diese Folge auf YouTube ansehen')
    expect(render({ ...episode, tmdbId: 211789 })).not.toContain('Diese Folge auf YouTube ansehen')
    expect(render({ ...episode, youtubePlaylistHint: null })).not.toContain('Diese Folge auf YouTube ansehen')
  })
  it('does not show an expired or forged episode route', () => {
    expect(render({ ...episode, youtubePlaylistHint: {
      ...hint, expiresAt: '2026-11-06T17:34:00.000Z',
    } })).not.toContain('Diese Folge auf YouTube ansehen')
    expect(render({ ...episode, youtubePlaylistHint: {
      ...hint, watchUrl: 'https://www.youtube.com/results?search_query=episode',
    } })).not.toContain('Diese Folge auf YouTube ansehen')
  })
})
