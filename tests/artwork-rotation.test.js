import { describe, expect, it } from 'vitest'
import {
  normalizeArtworkRotationMode,
  resolveArtworkUrl,
  resolvePresentationArtwork,
} from '../src/catalog/artworkRotation.js'
import {
  resizeTmdbImageUrl,
  responsiveTmdbImageProps,
} from '../src/services/tmdbImages.js'

const title = {
  id: 'tmdb-movie-11',
  tmdbId: 11,
  artwork: {
    posterPaths: ['/one.jpg', '/two.jpg', '/three.jpg'],
    heroBackdropPaths: ['/wide-one.jpg', '/wide-two.jpg'],
  },
}

describe('profilbezogene Bildrotation', () => {
  it('normalisiert alte Profile standardmäßig auf täglichen Wechsel', () => {
    expect(normalizeArtworkRotationMode()).toBe('daily')
    expect(normalizeArtworkRotationMode('invalid')).toBe('daily')
  })

  it('bleibt innerhalb eines Tages stabil und wechselt zyklisch am Folgetag', () => {
    const options = { profileId: 'main', rotationMode: 'daily' }
    const first = resolveArtworkUrl(title, { ...options, date: new Date(2026, 8, 13, 8) })
    const sameDay = resolveArtworkUrl(title, { ...options, date: new Date(2026, 8, 13, 22) })
    const nextDay = resolveArtworkUrl(title, { ...options, date: new Date(2026, 8, 14, 8) })
    expect(first).toBe(sameDay)
    expect(nextDay).not.toBe(first)
  })

  it('liefert bei ausgeschaltetem Wechsel immer den bestplatzierten Kandidaten', () => {
    expect(resolveArtworkUrl(title, { profileId: 'child', rotationMode: 'off' }))
      .toBe('https://image.tmdb.org/t/p/w500/one.jpg')
  })

  it('hält Poster und Hero-Auswahl getrennt', () => {
    const presented = resolvePresentationArtwork(title, {
      profileId: 'main',
      rotationMode: 'off',
    })
    expect(presented.displayPosterUrl).toContain('/w500/one.jpg')
    expect(presented.displayHeroBackdropUrl).toContain('/w1280/wide-one.jpg')
  })

  it('kann eine vorhandene TMDB-URL oberflächenbezogen skalieren', () => {
    expect(resizeTmdbImageUrl(
      'https://image.tmdb.org/t/p/w500/example.jpg',
      'w342',
    )).toBe('https://image.tmdb.org/t/p/w342/example.jpg')

    expect(responsiveTmdbImageProps(
      'https://image.tmdb.org/t/p/w500/example.jpg',
      {
        candidates: ['w342', 'w500'],
        fallbackSize: 'w342',
        sizes: '280px',
      },
    )).toEqual({
      src: 'https://image.tmdb.org/t/p/w342/example.jpg',
      srcSet: 'https://image.tmdb.org/t/p/w342/example.jpg 342w, https://image.tmdb.org/t/p/w500/example.jpg 500w',
      sizes: '280px',
    })
  })

  it('lässt Nicht-TMDB-Bildadressen unverändert', () => {
    expect(resizeTmdbImageUrl('https://example.test/poster.jpg', 'w342'))
      .toBe('https://example.test/poster.jpg')
    expect(responsiveTmdbImageProps('https://example.test/poster.jpg'))
      .toEqual({ src: 'https://example.test/poster.jpg' })
  })

  it('zählt dieselbe Datei als Pfad und URL nicht als zwei Bildvarianten', () => {
    const legacyTitle = {
      id: 'tmdb-movie-12',
      artwork: { posterPaths: ['/same.jpg'] },
      neutralPosterUrl: 'https://image.tmdb.org/t/p/w500/same.jpg',
    }
    expect(resolveArtworkUrl(legacyTitle, {
      profileId: 'main',
      rotationMode: 'daily',
      date: new Date(2026, 8, 13),
    })).toBe('https://image.tmdb.org/t/p/w500/same.jpg')
  })
})
