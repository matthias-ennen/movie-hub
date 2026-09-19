import { beforeEach, describe, expect, it } from 'vitest'
import { prioritizeProviderBadges } from '../src/components/ProviderBadges.jsx'
import { resetProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'

describe('provider badge priority', () => {
  beforeEach(() => resetProviderSelectionSnapshot({ loading: false }))

  it('keeps Movie Hub first and Waipu second within the three-badge limit', () => {
    expect(prioritizeProviderBadges(['netflix', 'prime', 'waipu', 'disney'], {
      includeMovieHub: true,
    })).toEqual(['moviehub', 'waipu', 'netflix'])
  })

  it('moves Waipu to the first position when Movie Hub is absent', () => {
    expect(prioritizeProviderBadges(['netflix', 'prime', 'waipu', 'disney']))
      .toEqual(['waipu', 'netflix', 'prime'])
  })

  it('preserves the existing provider order when neither priority badge exists', () => {
    expect(prioritizeProviderBadges(['netflix', 'prime', 'disney', 'youtube']))
      .toEqual(['netflix', 'prime', 'disney'])
  })

  it('deduplicates providers and never renders more than three badges', () => {
    expect(prioritizeProviderBadges(['waipu', 'waipu', 'netflix', 'prime'], {
      includeMovieHub: true,
      maxVisible: 99,
    })).toEqual(['moviehub', 'waipu', 'netflix'])
  })
})
