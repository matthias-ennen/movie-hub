import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PosterCard from '../src/components/PosterCard.jsx'

function tvItem(overrides = {}) {
  return {
    id: 'movie-1',
    type: 'movie',
    title: 'TV-Film',
    year: 2026,
    ageRating: 12,
    providerIds: [],
    tvAiring: {
      startTime: '2026-09-21T18:15:00.000Z',
      stationName: 'ZDF',
    },
    ...overrides,
  }
}

function renderCard(item) {
  return renderToStaticMarkup(<PosterCard item={item} onOpen={() => {}} />)
}

describe('TV-Zustand in der Poster-Metadatenzeile', () => {
  it('rendert ON AIR rechts nach dem Jahr und nicht im Film-/Serien-Kicker', () => {
    const markup = renderCard(tvItem({ tvAiringOnAir: true }))
    const kickerEnd = markup.indexOf('</span><span class="poster-copy">')
    const yearIndex = markup.indexOf('class="poster-year"')
    const statusIndex = markup.indexOf('class="on-air-badge"')

    expect(markup).toContain('class="poster-meta-line"')
    expect(statusIndex).toBeGreaterThan(yearIndex)
    expect(statusIndex).toBeGreaterThan(kickerEnd)
  })

  it('verwendet für BALD dieselbe Metadatenzeile', () => {
    const markup = renderCard(tvItem({ tvAiringSoon: true }))
    const metaStart = markup.indexOf('class="poster-meta-line"')
    const metaEnd = markup.indexOf('</span>', markup.indexOf('</span>', metaStart) + 1)
    const statusIndex = markup.indexOf('class="soon-badge"')

    expect(statusIndex).toBeGreaterThan(metaStart)
    expect(statusIndex).toBeLessThan(metaEnd)
  })
})
