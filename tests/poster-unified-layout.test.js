import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compactProviderOffers, mergeProviderOffers } from '../src/providers/providerOfferSnapshot.js'
import { labelForOfferTypes, providerOfferLabel } from '../src/providers/providerOfferLabels.js'

const css = readFileSync(new URL('../src/styles/poster-unified.css', import.meta.url), 'utf8')
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

describe('#385 shared poster geometry', () => {
  it('uses a single late stylesheet for TV, normal and Top Ten posters', () => {
    expect(entry).toContain("import './styles/poster-unified.css'")
    expect(css).toContain('.poster-card .poster-meta-line')
    expect(css).toContain('.top-ten-poster-card')
    expect(css).toContain('.collection-part-card .provider-badge')
    expect(css).toContain('.collection-part-art .provider-badges')
    expect(css).toContain('padding-bottom: calc(var(--poster-badge-height) + 1.75rem)')
    expect(css).toContain('--poster-badge-min-width:')
  })
  it('positions the extra label 60% above / 40% inside each badge', () => {
    expect(css).toMatch(/\.provider-badge \.provider-offer-tag\s*\{[^}]*top:\s*0;[^}]*transform:\s*translateY\(-60%\)/s)
  })
  it('does not push titles upwards to align the year and ON AIR / BALD', () => {
    expect(css).toContain('transform: translateY(-0.12rem)')
    expect(css).not.toMatch(/\.poster-card \.poster-title\s*\{[^}]*translateY\(-/s)
  })
})

describe('#385 compact TV offer evidence', () => {
  it('keeps real offer types, combines repeated providers, discards unknown categories', () => {
    expect(compactProviderOffers({
      tmdbProviderOffers: [
        { id: 'netflix', offerTypes: ['flatrate', 'rent', 'unknown'] },
        { id: 'netflix', offerTypes: ['buy'] },
      ],
    })).toEqual([{ id: 'netflix', offerTypes: ['flatrate', 'rent', 'buy'] }])
  })
  it('merges provider offers without inventing one from providerIds alone', () => {
    expect(mergeProviderOffers(
      [{ id: 'joyn', offerTypes: ['ads'] }],
      [{ id: 'disney', offerTypes: ['flatrate'] }],
      [{ id: 'joyn', offerTypes: [] }],
    )).toEqual([
      { id: 'joyn', offerTypes: ['ads'] },
      { id: 'disney', offerTypes: ['flatrate'] },
    ])
    expect(compactProviderOffers({ providerIds: ['netflix'] })).toEqual([])
  })
  it('shows FLAT on TV cards when the compact source contains that evidence', () => {
    const item = {
      tmdbProviderOffers: [{ id: 'wow', offerTypes: ['flatrate'] }],
      tvAiring: { providerIds: ['waipu', 'joyn'] },
    }
    expect(providerOfferLabel(item, 'wow', { context: 'airing' })).toBe('FLAT')
    expect(providerOfferLabel(item, 'waipu', { context: 'airing' })).toBe('AIR')
    expect(labelForOfferTypes(['rent', 'buy'])).toBe('R&B')
  })
})
