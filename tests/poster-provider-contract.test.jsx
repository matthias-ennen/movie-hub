import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import PosterCard from '../src/components/PosterCard.jsx'
import CollectionPicker from '../src/components/detail/CollectionPicker.jsx'
import { resolvePosterProviderModel } from '../src/providers/posterProviderModel.js'
import { enrichSearchPosterEntries } from '../src/search/searchPosterEvidence.js'
import { resetProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'

// The nested dialog is portaled on devices; SSR examines its stable markup only.
vi.mock('../src/components/detail/DetailDialog.jsx', () => ({
  default: ({ children }) => children,
}))

const item = {
  id: 'tmdb-movie-301528', type: 'movie', tmdbId: 301528, year: 2019,
  title: 'A Toy Story', providerIds: ['disney', 'magenta', 'youtube'],
  tmdbProviderOffers: [
    { id: 'disney', offerTypes: ['flatrate'] },
    { id: 'magenta', offerTypes: ['rent', 'buy'] },
  ],
}

beforeEach(() => resetProviderSelectionSnapshot({ loading: false }))

describe('#385 common provider contract across poster surfaces', () => {
  it('resolves identical labels and order from one common model', () => {
    const model = resolvePosterProviderModel(item)
    expect(model.offerLabels.disney).toBe('FLAT')
    expect(model.offerLabels.magenta).toBe('R&B')
    expect(model.hasAvailability).toBe(true)
    expect(model.providerIds.length).toBeLessThanOrEqual(3)
    const markup = renderToStaticMarkup(createElement(PosterCard, { item, onOpen: () => {} }))
    expect(markup).toContain('FLAT')
    expect(markup).toContain('R&amp;B')
    expect(markup).toContain('provider-disney')
  })

  it('renders FLAT and R&B on collection posters instead of bare badges', () => {
    const markup = renderToStaticMarkup(createElement(CollectionPicker, {
      filmCollection: { id: 44, name: 'Toy Story Filmreihe' },
      collectionParts: [item], item, currentCollectionIndex: 0,
      artworkOptions: {}, getTitleState: () => ({ watched: false }),
      isProviderEnabled: () => true, collectionBusyId: null,
      selectCollectionPart: () => {}, onClose: () => {},
    }))
    expect(markup).toContain('FLAT')
    expect(markup).toContain('R&amp;B')
    expect(markup).toContain('Bei deinen Anbietern verfügbar')
  })

  it('does not claim that an unverified collection part is unavailable', () => {
    const unknown = { id: 'tmdb-movie-900', tmdbId: 900, type: 'movie', title: 'Ungeprüft', providerIds: [] }
    const markup = renderToStaticMarkup(createElement(CollectionPicker, {
      filmCollection: { id: 44, name: 'Reihe' }, collectionParts: [unknown], item: unknown,
      currentCollectionIndex: 0, artworkOptions: {}, getTitleState: () => ({ watched: false }),
      isProviderEnabled: () => true, collectionBusyId: null, selectCollectionPart: () => {}, onClose: () => {},
    }))
    expect(markup).toContain('Verfügbarkeit beim Öffnen prüfen')
    expect(markup).not.toContain('Derzeit nicht bei deinen Anbietern')
  })

  it('enriches search cards from already loaded title evidence', () => {
    const [result] = enrichSearchPosterEntries([{
      id: item.id, tmdbId: item.tmdbId, type: 'movie', title: item.title,
      providerIds: [], providerOffers: [],
    }], [item])
    expect(result.tmdbProviderOffers).toEqual(item.tmdbProviderOffers)
    expect(resolvePosterProviderModel(result).offerLabels.disney).toBe('FLAT')
    expect(resolvePosterProviderModel(result).offerLabels.magenta).toBe('R&B')
  })

  it('uses authoritative catalog provider snapshots instead of stale search offers', () => {
    const [result] = enrichSearchPosterEntries([{
      id: item.id, type: 'movie', tmdbId: item.tmdbId,
      providerIds: ['prime'], providerOffers: [{ id: 'prime', offerTypes: ['buy'] }],
    }], [{
      ...item, providerIds: ['disney'], tmdbProviderIds: ['disney'],
      metadataChecks: { providers: 'present' },
    }])
    expect(result.providerIds).toEqual(['disney', 'magenta'])
    expect(result.tmdbProviderOffers.find((offer) => offer.id === 'prime')).toBeUndefined()
  })

  it('retains AIR for concrete broadcasts and limits posters to three provider badges', () => {
    const model = resolvePosterProviderModel({
      ...item, tvAiring: { providerIds: ['waipu'] },
    })
    expect(model.offerLabels.waipu).toBe('AIR')
    expect(model.providerIds).toHaveLength(3)
  })
})
