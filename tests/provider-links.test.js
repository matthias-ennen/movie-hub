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

  it('uses the provider home page where no stable public title search exists', () => {
    expect(getProviderDestination('disney', 'Shōgun')).toBe('https://www.disneyplus.com/de-de')
    expect(getProviderDestination('waipu', 'Dune: Part Two')).toBe('https://www.waipu.tv/')
  })

  it('does not create a destination for unknown providers', () => {
    expect(getProviderDestination('unknown', 'Dune: Part Two')).toBeNull()
  })
})
