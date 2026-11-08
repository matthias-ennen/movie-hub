import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import TvView, { TvProgramContent } from '../src/components/TvView.jsx'

vi.mock('../src/library/useSharedMediaCatalog.js', () => ({
  useSharedMediaCatalog: () => ({ hasTitle: () => false }),
}))

vi.mock('../src/settings/useProviderSelection.js', () => ({
  useProviderSelection: () => ({ isProviderEnabled: () => true }),
}))

const heroItem = {
  id: 'movie-1',
  type: 'movie',
  title: 'Sofort sichtbarer TV-Hero',
  description: 'Der Hero ist vom vollständigen Laden der Senderdateien entkoppelt.',
  backdropUrl: 'https://image.test/hero.jpg',
  score: '8.0',
  year: 2026,
  meta: 'Film',
  providerIds: ['waipu'],
}

function renderTvView(overrides = {}) {
  return renderToStaticMarkup(
    <TvView
      rows={[]}
      heroItems={[heroItem]}
      heroReadyEnabled
      periods={[{ id: 'day:2026-09-21', label: 'Heute' }]}
      selectedPeriodId="day:2026-09-21"
      onPeriodChange={() => {}}
      stations={[{ id: 'zdf', name: 'ZDF' }]}
      totalStationCount={50}
      status="loading"
      generatedAt="2026-09-21T12:00:00.000Z"
      onOpen={() => {}}
      {...overrides}
    />,
  )
}

describe('TV Hero-first-Seitenrahmen', () => {
  it('zeigt den saisonalen TV-Hero-Titel ohne zusätzlichen ThemeProvider', () => {
    const markup = renderTvView({ heroHeading: 'Festliches im TV' })
    expect(markup).toContain('Festliches im TV')
  })

  it('rendert während der Hero-Phase ausschließlich den Hero', () => {
    const markup = renderTvView()

    expect(markup).toContain('class="hero-first-page category-page tv-program-page"')
    expect(markup).toContain('Sofort sichtbarer TV-Hero')
    expect(markup).not.toContain('class="browse-page tv-program-content"')
    expect(markup).not.toContain('Sendetermine werden geladen')
    expect(markup).not.toContain('class="tv-period-shell"')
  })

  it('mountet Zeitraumleiste und Reihen erst nach heroReady im gemeinsamen Inhaltscontainer', () => {
    const markup = renderToStaticMarkup(
      <TvProgramContent
        heroReady
        rows={[{ id: 'tv-row', title: 'Filme heute im Fernsehen', items: [heroItem] }]}
        periods={[{ id: 'day:2026-09-21', label: 'Heute' }]}
        selectedPeriodId="day:2026-09-21"
        onPeriodChange={() => {}}
        status="ready"
        onOpen={() => {}}
      />,
    )

    expect(markup).toContain('class="browse-page tv-program-content"')
    expect(markup).toContain('class="tv-period-shell"')
    expect(markup).toContain('class="rows-wrap tv-program-rows"')
    expect(markup).not.toContain('50 von 50 Sendern')
    expect(markup).not.toContain('tv-period-status')
  })

  it('mountet den TV-Programmbereich ohne heroReady überhaupt nicht', () => {
    const markup = renderToStaticMarkup(
      <TvProgramContent
        heroReady={false}
        rows={[]}
        periods={[]}
        selectedPeriodId=""
        onPeriodChange={() => {}}
        status="loading"
        onOpen={() => {}}
      />,
    )

    expect(markup).toBe('')
  })
})


describe('#724 TV navigation never unmounts during poster-only reloads', () => {
  const periods = [
    { id: '14-days', label: '14 Tage' },
    { id: 'day:2026-09-21', label: 'Heute' },
    { id: 'day:2026-09-22', label: 'Morgen' },
  ]

  for (const status of ['loading', 'ready', 'unavailable', 'no-stations']) {
    it(`keeps all date buttons mounted for status ${status}`, () => {
      const view = renderToStaticMarkup(
        <TvProgramContent heroReady rows={[]} periods={periods}
          selectedPeriodId="day:2026-09-22" onPeriodChange={vi.fn()}
          status={status} onOpen={vi.fn()} />,
      )
      expect(view).toContain('class="tv-period-shell"')
      expect(view).toContain('14 Tage')
      expect(view).toContain('Heute')
      expect(view).toContain('Morgen')
      expect(view).toContain('class="tv-period-button active"')
      expect(view).toContain('aria-selected="true"')
      expect(view.match(/data-tv-period="true"/g)).toHaveLength(3)
    })
  }
})
