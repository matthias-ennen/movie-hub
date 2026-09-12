import { describe, expect, it } from 'vitest'
import {
  isSmbMediaUrl,
  normaliseMedia,
  normalizeMediaUrl,
  normalizeSmbUrl,
  normalizeVideoUrl,
  titleMediaKey,
} from '../src/library/sharedMediaModel.js'
import {
  buildSharedMediaTitleRef,
  mergeSharedMediaCatalogTitles,
  normalizeSharedMediaCatalogEntry,
} from '../src/library/sharedMediaCatalogModel.js'

describe('gemeinsame Movie-Hub-Medien', () => {
  it('uses a media-type-qualified key so movie and series ids cannot collide', () => {
    expect(titleMediaKey({ tmdbId: 11, type: 'movie' })).toBe('movie-11')
    expect(titleMediaKey({ tmdbId: 11, type: 'series' })).toBe('series-11')
  })

  it('accepts HTTP(S) links and direct Internet videos', () => {
    expect(normaliseMedia({ label: ' NAS ', url: 'http://192.168.1.20/video.mp4', type: 'video' }))
      .toMatchObject({ label: 'NAS', url: 'http://192.168.1.20/video.mp4', type: 'video' })
    expect(normaliseMedia({ label: 'IMDb', url: 'https://example.com/watch', type: 'web' }))
      .toMatchObject({ label: 'IMDb', url: 'https://example.com/watch', type: 'web' })
    expect(normalizeMediaUrl('https://example.com/watch')).toBe('https://example.com/watch')
  })

  it('detects SMB and UNC automatically for videos', () => {
    expect(isSmbMediaUrl('smb://fritz.box/FRITZ.NAS/Filme/Test.mp4')).toBe(true)
    expect(isSmbMediaUrl('\\\\fritz.box\\FRITZ.NAS\\Filme\\Test.mp4')).toBe(true)
    expect(isSmbMediaUrl('https://example.com/video.mp4')).toBe(false)

    expect(normaliseMedia({ label: 'FRITZ NAS', url: 'smb://fritz.box/FRITZ.NAS/Filme/Test.mp4', type: 'video' }))
      .toMatchObject({ label: 'FRITZ NAS', url: 'smb://fritz.box/FRITZ.NAS/Filme/Test.mp4', type: 'video' })
    expect(normalizeVideoUrl('\\\\fritz.box\\FRITZ.NAS\\Meine Filme\\Test.mkv'))
      .toBe('smb://fritz.box/FRITZ.NAS/Meine%20Filme/Test.mkv')
    expect(normalizeSmbUrl('\\\\fritz.box\\FRITZ.NAS\\Meine Filme\\Test.mkv'))
      .toBe('smb://fritz.box/FRITZ.NAS/Meine%20Filme/Test.mkv')
    expect(normalizeSmbUrl('smb://fritz.box/FRITZ.NAS/Meine%20Filme/Test%20Film.mkv'))
      .toBe('smb://fritz.box/FRITZ.NAS/Meine%20Filme/Test%20Film.mkv')
  })

  it('normalizes SMB without relying on the browser URL parser', () => {
    const originalUrl = globalThis.URL
    globalThis.URL = class UnsupportedUrlParser {
      constructor() {
        throw new Error('custom schemes unsupported')
      }
    }

    try {
      expect(normalizeSmbUrl('smb://fritz.box/FRITZ.NAS/Filme/Cujo.mkv'))
        .toBe('smb://fritz.box/FRITZ.NAS/Filme/Cujo.mkv')
      expect(normaliseMedia({ label: 'Cujo', url: 'smb://fritz.box/FRITZ.NAS/Filme/Cujo.mkv', type: 'video' }))
        .toMatchObject({ label: 'Cujo', url: 'smb://fritz.box/FRITZ.NAS/Filme/Cujo.mkv', type: 'video' })
    } finally {
      globalThis.URL = originalUrl
    }
  })

  it('migrates legacy provider and SMB types without losing their URLs', () => {
    expect(normaliseMedia({
      id: 'provider-netflix',
      label: 'Netflix direkt',
      url: 'https://www.netflix.com/title/81914143?trackId=123',
      type: 'provider',
      providerId: 'netflix',
    })).toEqual({
      id: 'provider-netflix',
      label: 'Netflix direkt',
      url: 'https://www.netflix.com/title/81914143?trackId=123',
      type: 'web',
    })

    expect(normaliseMedia({
      id: 'nas-old',
      label: 'NAS',
      url: 'smb://fritz.box/FRITZ.NAS/Filme/Test.mp4',
      type: 'smb',
    })).toEqual({
      id: 'nas-old',
      label: 'NAS',
      url: 'smb://fritz.box/FRITZ.NAS/Filme/Test.mp4',
      type: 'video',
    })
  })

  it('rejects credentials, local files, scripts and malformed SMB paths', () => {
    expect(() => normalizeSmbUrl('smb://user:secret@fritz.box/FRITZ.NAS/Test.mp4')).toThrow(/Kennwort/)
    expect(() => normalizeSmbUrl('smb://fritz.box/FRITZ.NAS')).toThrow(/Freigabe/)
    expect(() => normalizeSmbUrl('smb://fritz.box/FRITZ.NAS/../Test.mp4')).toThrow(/relativen/)
    for (const url of ['file:///sdcard/video.mp4', 'javascript:alert(1)']) {
      expect(() => normalizeMediaUrl(url)).toThrow(/HTTP/)
      expect(() => normalizeVideoUrl(url)).toThrow(/HTTP/)
    }
  })

  it('does not accept SMB paths as normal links', () => {
    expect(() => normalizeMediaUrl('smb://fritz.box/FRITZ.NAS/Filme/Test.mp4')).toThrow(/HTTP/)
  })

  it('requires a visible label', () => {
    expect(() => normaliseMedia({ label: ' ', url: 'https://example.com', type: 'web' }))
      .toThrow(/Bezeichnung/)
  })

  it('builds a deduplicated Movie-Hub provider title from the shared-media manifest', () => {
    const item = { id: 'tmdb-movie-11', tmdbId: 11, type: 'movie', title: 'Testfilm', year: 2026 }
    const titleRef = buildSharedMediaTitleRef(item)
    const entry = normalizeSharedMediaCatalogEntry('movie-11', { hasMedia: true, titleRef })
    const merged = mergeSharedMediaCatalogTitles([entry], [{ ...item, providerIds: ['netflix'] }])
    expect(merged).toHaveLength(1)
    expect(merged[0].providerIds).toEqual(['moviehub', 'netflix'])
    expect(merged[0].movieHubCatalog).toBe(true)
  })
})
