import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTmdbImageUrl } from '../src/tmdb/tmdbImageUrl.js'
import { buildTmdbImageUrl as legacyBuildTmdbImageUrl } from '../src/services/tmdb.js'

const modelSource = readFileSync(new URL('../src/tmdb/tmdbCatalogModel.js', import.meta.url), 'utf8')

describe('TMDB-Bild-URL-Helfer', () => {
  it('bleibt über den bisherigen Service-Export kompatibel', () => {
    expect(buildTmdbImageUrl('/poster.jpg')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(buildTmdbImageUrl('poster.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/poster.jpg')
    expect(legacyBuildTmdbImageUrl('/poster.jpg')).toBe(buildTmdbImageUrl('/poster.jpg'))
    expect(buildTmdbImageUrl(null)).toBeNull()
  })

  it('zieht den großen TMDB-Service nicht mehr in die persönliche Katalognormalisierung', () => {
    expect(modelSource).toContain("from './tmdbImageUrl.js'")
    expect(modelSource).not.toContain("from '../services/tmdb.js'")
  })
})
