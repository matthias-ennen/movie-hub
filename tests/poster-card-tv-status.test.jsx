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


describe('zentrale Provider-Darstellung auf Postern', () => {
  it('zeigt bei einem zusammengeführten TV-Airing sowohl Joyn als auch Waipu', () => {
    const markup = renderCard(tvItem({
      tmdbProviderIds: [],
      providerIds: ['joyn'],
      liveAvailability: {
        joyn: { providerId: 'joyn' },
        waipu: { providerId: 'waipu' },
      },
      tvAiring: {
        startTime: '2026-09-21T18:15:00.000Z',
        stopTime: '2026-09-21T20:15:00.000Z',
        stationName: 'TELE 5',
        providerIds: ['joyn', 'waipu'],
      },
    }))

    expect(markup).toContain('provider-joyn')
    expect(markup).toContain('provider-waipu')
  })

  it('zeigt bei einer konkreten Joyn-Ausstrahlung kein titelweites Waipu-Badge', () => {
    const markup = renderCard(tvItem({
      tmdbProviderIds: [],
      liveAvailability: {
        joyn: { providerId: 'joyn' },
        waipu: { providerId: 'waipu' },
      },
      tvAiring: {
        startTime: '2026-09-21T18:15:00.000Z',
        stopTime: '2026-09-21T20:15:00.000Z',
        stationName: 'TELE 5',
        providerIds: ['joyn'],
      },
    }))

    expect(markup).toContain('provider-joyn')
    expect(markup).not.toContain('provider-waipu')
  })
})
