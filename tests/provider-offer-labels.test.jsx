import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProviderBadge } from '../src/components/ProviderBadges.jsx'
import { labelForOfferTypes, providerOfferLabel } from '../src/providers/providerOfferLabels.js'

describe('#385 provider access labels', () => {
  it('uses exactly one dominant label without losing original offer data', () => {
    const offers = ['buy', 'rent', 'flatrate']
    expect(labelForOfferTypes(offers)).toBe('FLAT')
    expect(offers).toEqual(['buy', 'rent', 'flatrate'])
    expect(labelForOfferTypes(['rent', 'buy'])).toBe('R&B')
    expect(labelForOfferTypes(['free', 'ads', 'buy'])).toBe('FREE')
    expect(labelForOfferTypes(['ads', 'buy'])).toBe('ADS')
    expect(labelForOfferTypes(['rent'])).toBe('RENT')
    expect(labelForOfferTypes(['buy'])).toBe('BUY')
    expect(labelForOfferTypes(['catalog'])).toBeNull()
  })

  it('recognizes MovieHub as FREE and keeps Joyn TV distinct from Joyn streaming', () => {
    const item = {
      providerOffers: [{ id: 'joyn', offerTypes: ['flatrate', 'rent', 'buy'] }],
      tvAiring: { providerIds: ['joyn'], startTime: '2026-10-17T18:15:00Z' },
    }
    expect(providerOfferLabel(item, 'moviehub')).toBe('FREE')
    expect(providerOfferLabel(item, 'joyn')).toBe('FLAT')
    expect(providerOfferLabel(item, 'joyn', { context: 'airing' })).toBe('AIR')
    expect(providerOfferLabel(item, 'waipu')).toBeNull()
    expect(providerOfferLabel({ liveAvailability: { waipu: { airings: [{ startTime: 'tomorrow' }] } } }, 'waipu')).toBe('AIR')
  })

  it('renders a single blue tag above the original provider short code', () => {
    const item = { providerOffers: [{ id: 'prime', offerTypes: ['rent', 'buy'] }] }
    const prime = renderToStaticMarkup(<ProviderBadge providerId="prime" item={item} />)
    expect(prime).toContain('provider-badge-symbol')
    expect(prime).toContain('provider-offer-tag')
    expect(prime).toContain('R&amp;B')
    expect(prime.match(/provider-offer-tag/g)).toHaveLength(1)
    const moviehub = renderToStaticMarkup(<ProviderBadge providerId="moviehub" />)
    expect(moviehub).toContain('FREE')
    const unknown = renderToStaticMarkup(<ProviderBadge providerId="prime" />)
    expect(unknown).not.toContain('provider-offer-tag')
  })
})
