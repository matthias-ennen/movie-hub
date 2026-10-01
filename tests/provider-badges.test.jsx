import { beforeEach, describe, expect, it } from 'vitest'
import { prioritizeProviderBadges } from '../src/components/ProviderBadges.jsx'
import { resetProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'

describe('provider badge priority', () => {
  beforeEach(() => resetProviderSelectionSnapshot({ loading: false }))

  it('keeps Movie Hub first, then Waipu and Joyn within the three-badge limit', () => {
    expect(prioritizeProviderBadges(['netflix', 'prime', 'joyn', 'waipu', 'disney'], {
      includeMovieHub: true,
    })).toEqual(['moviehub', 'waipu', 'joyn'])
  })

  it('keeps Waipu and Joyn first when Movie Hub is absent', () => {
    expect(prioritizeProviderBadges(['netflix', 'prime', 'joyn', 'waipu', 'disney']))
      .toEqual(['waipu', 'joyn', 'netflix'])
  })

  it('moves Joyn ahead of normal TMDB providers when Waipu is absent', () => {
    expect(prioritizeProviderBadges(['prime', 'joyn', 'netflix', 'disney']))
      .toEqual(['joyn', 'netflix', 'prime'])
  })

  it('uses the canonical registry order for the remaining providers', () => {
    expect(prioritizeProviderBadges(['disney', 'prime', 'youtube', 'netflix']))
      .toEqual(['netflix', 'prime', 'disney'])
  })

  it('deduplicates providers and never renders more than three badges', () => {
    expect(prioritizeProviderBadges(['joyn', 'waipu', 'waipu', 'netflix', 'prime'], {
      includeMovieHub: true,
      maxVisible: 99,
    })).toEqual(['moviehub', 'waipu', 'joyn'])
  })
})
