import { describe, expect, it } from 'vitest'
import { resolveProviderPresentation } from '../src/providers/providerPresentation.js'
import { resolvePosterProviderModel } from '../src/providers/posterProviderModel.js'
import { providerOfferLabel } from '../src/providers/providerOfferLabels.js'
import { buildDetailStreamingProviderIds } from '../src/components/detailProviderPresentation.js'
import { hasEnabledAvailability } from '../src/catalog/contentCuration.js'
import { providers, getProviderDestination } from '../src/data/catalog.js'
import { withVerifiedYoutubeTitleOffer } from '../src/providers/youtubeVerifiedTitlePresentation.js'

const NOW = '2026-10-23T10:00:00.000Z'
const VIDEO_ID = '0nBiidtN7ZU'
const item = {
  type: 'movie', tmdbId: 539892, title: 'Freaks',
  tmdbProviderIds: [], tmdbProviderOffers: [],
  providerIds: [],
}
const entry = {
  key: 'movie:539892', mediaType: 'movie', tmdbId: 539892,
  verifiedVideoId: VIDEO_ID, target: 'https://www.youtube.com/watch?v=' + VIDEO_ID,
  accessType: 'ads', verifiedAt: NOW, validUntil: '2026-10-27T10:00:00.000Z',
}
const index = {
  schemaVersion: 1, kind: 'moviehub-youtube-verified-title-routes',
  providerId: 'youtube', count: 1, entries: [entry],
}
function projected(source = item, routeIndex = index, now = Date.parse(NOW)) {
  return withVerifiedYoutubeTitleOffer(source, routeIndex, { now })
}
describe('same independently verified YouTube offer across MovieHub poster and detail', () => {
  it('adds a single YouTube-only badge and ADS label to both poster and detail', () => {
    const original = structuredClone(item)
    const enriched = projected()
    const poster = resolvePosterProviderModel(enriched)
    const presentation = resolveProviderPresentation(enriched)
    const detail = buildDetailStreamingProviderIds(presentation, providers, [], enriched)
    expect(poster.providerIds).toEqual(['youtube'])
    expect(poster.offerLabels.youtube).toBe('ADS')
    expect(detail).toEqual(['youtube'])
    expect(providerOfferLabel(enriched, 'youtube')).toBe('ADS')
    expect(presentation.tmdbProviderIds).toEqual([])
    expect(presentation.verifiedTitleProviderIds).toEqual(['youtube'])
    expect(item).toEqual(original)
    expect(getProviderDestination('youtube', item.title)).toContain('results?search_query=')
  })
  it('keeps TMDB evidence and avoids duplicate badges when both sources agree', () => {
    const original = {
      ...item, tmdbProviderIds: ['youtube'],
      tmdbProviderOffers: [{ id: 'youtube', offerTypes: ['rent', 'buy'] }],
      providerIds: ['youtube'],
    }
    const enriched = projected(original)
    const poster = resolvePosterProviderModel(enriched)
    const detail = buildDetailStreamingProviderIds(resolveProviderPresentation(enriched), providers, [], enriched)
    expect(poster.providerIds).toEqual(['youtube'])
    expect(poster.offerLabels.youtube).toBe('R&B') // TMDB offers retain priority.
    expect(detail).toEqual(['youtube'])
    expect(original.tmdbProviderOffers).toEqual([{ id: 'youtube', offerTypes: ['rent', 'buy'] }])
  })
  it('does not publish unverified, stale, wrong-title or series badges', () => {
    const expired = projected(item, index, Date.parse('2026-10-28T10:00:00.000Z'))
    expect(resolvePosterProviderModel(expired).providerIds).toEqual([])
    expect(projected({ ...item, tmdbId: 1 })).toEqual({ ...item, tmdbId: 1 })
    expect(projected({ ...item, type: 'series' })).toEqual({ ...item, type: 'series' })
    expect(projected(item, { ...index, entries: [], count: 0 })).toEqual(item)
    expect(projected({ ...item, verifiedTitleOffers: [{ id: 'youtube', offerTypes: ['free'] }] }, null))
      .toEqual(item) // Untrusted material is erased.
  })
  it('retains TMDB-only badges when the verified route expires', () => {
    const tmdb = {
      ...item, tmdbProviderIds: ['youtube'], providerIds: ['youtube'],
      tmdbProviderOffers: [{ id: 'youtube', offerTypes: ['free'] }],
    }
    const expired = projected(tmdb, index, Date.parse('2026-10-28T10:00:00.000Z'))
    expect(resolvePosterProviderModel(expired).providerIds).toEqual(['youtube'])
    expect(providerOfferLabel(expired, 'youtube')).toBe('FREE')
    expect(getProviderDestination('youtube', expired.title)).toContain('search_query=')
  })
  it('respects disabled YouTube and three-badge poster limit, while detail shows all', () => {
    const enriched = projected({
      ...item, tmdbProviderIds: ['waipu', 'joyn', 'netflix'],
      providerIds: ['waipu', 'joyn', 'netflix'],
    })
    expect(hasEnabledAvailability(enriched, ['youtube'])).toBe(true)
    expect(hasEnabledAvailability(enriched, ['netzkino'])).toBe(false)
    const poster = resolvePosterProviderModel(enriched, { hasMovieHub: true })
    expect(poster.providerIds).toEqual(['moviehub', 'waipu', 'joyn'])
    expect(poster.allProviderIds).toContain('youtube')
    const detail = buildDetailStreamingProviderIds(resolveProviderPresentation(enriched), providers, [], enriched)
    expect(detail).toContain('youtube')
  })
})
