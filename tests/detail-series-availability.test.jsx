import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DetailModal from '../src/components/DetailModal.jsx'

vi.mock('../src/profiles/ProfileProvider.jsx', () => ({ useProfiles: () => ({ activeProfile: { id: 'test', displayName: 'Test' } }) }))
vi.mock('../src/hooks/useAuth.js', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../src/library/LibraryProvider.jsx', () => ({ useLibrary: () => ({ getTitleState: () => ({ note: '' }), loading: false }) }))
vi.mock('../src/settings/useProviderSelection.js', () => ({ useProviderSelection: () => ({ isProviderEnabled: () => true }) }))
vi.mock('../src/notifications/useTitleAlerts.js', () => ({ useTitleAlerts: () => ({ isEnabled: () => false, canWatch: () => true }) }))
vi.mock('../src/library/sharedMedia.js', () => ({ loadSharedMedia: vi.fn(), saveSharedMedia: vi.fn(), removeSharedMedia: vi.fn() }))

const episode = { seasonNumber: 16, episodeNumber: 3, title: 'Minderjährig', tmdbId: 1010787 }
const base = { id: 'series-2734', tmdbId: 2734, type: 'series', title: 'Law & Order',
  description: 'Handlung', numberOfSeasons: 26, availableSeasons: [[16, 23]] }
function render(item, reference) {
  const airing = { stationName: '13th Street', stationId: '13thstreet',
    startTime: '2026-10-13T13:45:00Z', stopTime: '2026-10-13T14:30:00Z', episode: reference }
  return renderToStaticMarkup(<DetailModal item={{ ...item, detailAiring: airing }}
    sharedMediaPreloaded initialSharedMedia={[]} initialPrimaryImageUrl={null}
    liveAvailabilityNow={Date.parse('2026-10-13T13:00:00Z')} onClose={() => {}} />)
}

describe('sichtbarer Staffelbestand in der echten Detailseite', () => {
  it('entfernt die ganze Kachel bei leerem Bestand und beendet die TV-Zeile beim Sender', () => {
    const html = render({ ...base, availableSeasons: [] }, { ...episode, resolution: 'matched' })
    expect(html).not.toContain('Staffeln und Folgen')
    expect(html).not.toContain('Minderjährig')
    expect(html).toContain('Dienstag, 13. Oktober · 15:45 Uhr · 13th Street</p>')
  })
  it('zeigt bei fehlender Zuordnung die manuelle Auswahl ohne Erklärungsabsatz', () => {
    const html = render(base, { ...episode, resolution: 'conflict' })
    expect(html).toContain('Staffeln und Folgen')
    expect(html).toContain('Staffel 16')
    expect(html).toContain('Folge auswählen')
    expect(html).not.toContain('Minderjährig')
    expect(html).not.toContain('episodes-status')
    const unknown = render(base, { resolution: 'missing-reference' })
    expect(unknown).toContain('Staffel auswählen')
    expect(unknown).not.toContain('episodes-status')
  })
  it('zeigt die zugeordnete Folge genau einmal in der Auswahlkachel', () => {
    const html = render(base, { ...episode, resolution: 'matched', catalog: episode })
    expect(html).toContain('Folge 3 · Minderjährig')
    expect(html.split('Minderjährig')).toHaveLength(2)
    expect(html).not.toContain('episodes-status')
  })
})
