import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import DetailLiveProviderAction from '../src/components/detail/DetailLiveProviderAction.jsx'
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
    isProviderEnabled: () => true, enabledProviderIds: ['waipu', 'joyn'],
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

const now = Date.parse('2026-11-06T13:00:00.000Z')
const series = {
  id: 'series-4238', tmdbId: 4238, type: 'series', title: 'King of Queens',
  description: 'Serienhandlung', availableSeasons: [],
}
function tvAiring(startTime, endTime, providerIds = ['waipu']) {
  return {
    type: 'series', tmdbId: 4238, stationId: 'warner-comedy',
    stationName: 'WARNER TV COMEDY', startTime, stopTime: endTime,
    providerIds,
    episode: { seasonNumber: 1, episodeNumber: 11, title: 'Das Paket' },
    playbackRoutes: providerIds.map(providerId => ({
      providerId, mode: 'WEB_LINK', scope: 'channel',
      target: `https://example.org/${providerId}/warner-comedy`,
    })),
  }
}
const first = tvAiring('2026-11-06T15:30:00.000Z', '2026-11-06T16:00:00.000Z')
const next = tvAiring('2026-11-09T06:20:00.000Z', '2026-11-09T06:50:00.000Z')

describe('#708 consistent live provider badges for repeated TV airings', () => {
  it('uses the canonical white provider action and branded badge for every broadcast', () => {
    const html = renderToStaticMarkup(<DetailModal item={{
      ...series, detailAiring: first,
      liveAvailability: { waipu: { providerId: 'waipu', airings: [first, next] } },
    }} liveAvailabilityNow={now} onClose={() => {}}
      sharedMediaPreloaded initialSharedMedia={[]} initialPrimaryImageUrl={null} />)
    expect(html).toContain('Weitere Ausstrahlungstermine')
    expect(html).toContain('Freitag, 6. November')
    expect(html).toContain('Montag, 9. November')
    expect((html.match(/provider-badge provider-waipu/g) || []).length).toBe(2)
    // Both entries use the same action classes, not an unstyled secondary button.
    expect((html.match(/class="action-button provider-action"/g) || []).length).toBe(2)
    expect(html).toContain('detail-tv-additional-airings')
  })

  it('uses identical badges for a disabled playback route without an invalid button', () => {
    const item = { ...series, tvAiring: next }
    const enabled = renderToStaticMarkup(<DetailLiveProviderAction
      providerId="waipu" item={item} canLaunch onOpen={() => {}} subject="diesen Sendetermin" />)
    const disabled = renderToStaticMarkup(<DetailLiveProviderAction
      providerId="waipu" item={item} canLaunch={false} onOpen={() => {}} subject="diesen Sendetermin" />)
    expect(enabled).toContain('class="action-button provider-action"')
    expect(disabled).toContain('class="provider-action provider-action-static"')
    expect(disabled).not.toContain('<button')
    expect(enabled).toContain('provider-badge provider-waipu')
    expect(disabled).toContain('provider-badge provider-waipu')
  })

  it('shows Joyn identically and keeps the same spacing as Streaming/Mediathek', () => {
    const view = renderToStaticMarkup(<DetailLiveProviderAction
      providerId="joyn" item={{ ...series, tvAiring: next }} canLaunch
      onOpen={() => {}} subject="diesen Sendetermin" />)
    expect(view).toContain('class="action-button provider-action"')
    expect(view).toContain('provider-badge provider-joyn')
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.provider-availability-streaming,\s*\.detail-tv-additional-airings\s*\{\s*margin-top:\s*var\(--space-4\);/)
  })
})
