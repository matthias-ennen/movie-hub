import { describe, expect, it } from 'vitest'
import { getProviderDestination } from '../src/data/catalog.js'

describe('provider destinations', () => {
  it('builds public provider destinations from the selected title', () => {
    expect(getProviderDestination('netflix', 'Dune: Part Two'))
      .toBe('https://www.netflix.com/search?q=Dune%3A%20Part%20Two')
    expect(getProviderDestination('prime', 'Dune: Part Two'))
      .toBe('https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Dune%3A%20Part%20Two')
    expect(getProviderDestination('youtube', 'Dune: Part Two'))
      .toBe('https://www.youtube.com/results?search_query=Dune%3A%20Part%20Two')
  })

  it('uses stable provider entry pages where no title search is required', () => {
    expect(getProviderDestination('disney', 'Shōgun')).toBe('https://www.disneyplus.com/de-de')
    expect(getProviderDestination('waipu', 'Machete Kills')).toBe('https://app.waipu.tv/waiputhek')
    expect(getProviderDestination('waipu', 'Live TV', { waipuMode: 'live' }))
      .toBe('https://www.waipu.tv/sender/das-erste/')
  })

  it('does not create a destination for unknown providers', () => {
    expect(getProviderDestination('unknown', 'Dune: Part Two')).toBeNull()
  })

  it('keeps every supported fallback on its expected HTTPS provider domain', () => {
    const expectedHosts = {
      netflix: 'www.netflix.com',
      prime: 'www.primevideo.com',
      disney: 'www.disneyplus.com',
      youtube: 'www.youtube.com',
      waipu: 'app.waipu.tv',
    }

    for (const [providerId, expectedHost] of Object.entries(expectedHosts)) {
      const destination = getProviderDestination(providerId, 'Dune: Part Two')
      const parsed = new URL(destination)
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe(expectedHost)
    }
  })
})
