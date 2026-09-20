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
  mergeTitlesWithSharedMediaCatalog,
  normalizeSharedMediaCatalogEntry,
  sharedMediaCatalogTitle,
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

  it('builds a Movie-Hub provider view from the canonical TMDB title', () => {
    const item = {
      id: 'tmdb-movie-11',
      tmdbId: 11,
      type: 'movie',
      title: 'Testfilm',
      year: 2026,
      collectionId: 40,
      collectionName: 'Testreihe',
      collectionChecked: true,
      metadataVersion: 2,
      metadataComplete: true,
      metadataChecks: { details: 'present', collection: 'absent' },
      artwork: { posterPaths: ['/a.jpg', '/b.jpg'], heroBackdropPaths: ['/wide.jpg'] },
    }
    const titleRef = buildSharedMediaTitleRef(item)
    const entry = normalizeSharedMediaCatalogEntry('movie-11', { hasMedia: true, titleRef })
    const merged = mergeSharedMediaCatalogTitles([entry], [{ ...item, providerIds: ['netflix'] }])
    expect(merged).toHaveLength(1)
    expect(merged[0].providerIds).toEqual(['moviehub', 'netflix'])
    expect(merged[0].movieHubCatalog).toBe(true)
    expect(merged[0].sharedMediaFallback).toBe(false)
    expect(titleRef).toMatchObject({
      collectionId: 40,
      collectionName: 'Testreihe',
      collectionChecked: true,
      metadataVersion: 2,
      metadataComplete: true,
      metadataChecks: { details: 'present', collection: 'absent' },
      artwork: { posterPaths: ['/a.jpg', '/b.jpg'], heroBackdropPaths: ['/wide.jpg'] },
    })
  })

  it('uses TMDB type + id as identity even when the cached title text is missing', () => {
    const entry = normalizeSharedMediaCatalogEntry('legacy-wrong-key', {
      hasMedia: true,
      titleRef: { tmdbId: 1573, type: 'movie', title: '' },
    })
    expect(entry).not.toBeNull()
    expect(entry.key).toBe('movie-1573')
  })

  it('never lets a cached TMDB placeholder overwrite the canonical title', () => {
    const entry = normalizeSharedMediaCatalogEntry('movie-1573', {
      hasMedia: true,
      titleRef: {
        id: 'tmdb-movie-1573',
        tmdbId: 1573,
        type: 'movie',
        title: 'TMDB #1573',
        year: 1900,
        posterUrl: 'https://stale.example/poster.jpg',
        providerIds: ['disney'],
        metadataVersion: 2,
        metadataComplete: true,
      },
    })
    const canonical = {
      id: 'tmdb-movie-1573',
      tmdbId: 1573,
      type: 'movie',
      title: 'Stirb langsam 2',
      year: 1990,
      posterUrl: 'https://image.tmdb.org/current.jpg',
      providerIds: ['prime'],
      metadataVersion: 1,
      metadataComplete: false,
    }

    const [movieHubTitle] = mergeSharedMediaCatalogTitles([entry], [canonical])
    expect(movieHubTitle.title).toBe('Stirb langsam 2')
    expect(movieHubTitle.year).toBe(1990)
    expect(movieHubTitle.posterUrl).toBe('https://image.tmdb.org/current.jpg')
    expect(movieHubTitle.providerIds).toEqual(['moviehub', 'prime'])
    expect(movieHubTitle.providerIds).not.toContain('disney')
    expect(movieHubTitle.sharedMediaFallback).toBe(false)

    const [combined] = mergeTitlesWithSharedMediaCatalog([canonical], [movieHubTitle])
    expect(combined.title).toBe('Stirb langsam 2')
    expect(combined.year).toBe(1990)
    expect(combined.posterUrl).toBe('https://image.tmdb.org/current.jpg')
    expect(combined.providerIds).toEqual(['moviehub', 'prime'])
  })

  it('uses a stored title snapshot only as a non-canonical fallback when TMDB data is not loaded', () => {
    const entry = normalizeSharedMediaCatalogEntry('movie-562', {
      hasMedia: true,
      titleRef: {
        id: 'tmdb-movie-562',
        tmdbId: 562,
        type: 'movie',
        title: 'Stirb langsam',
        year: 1988,
        providerIds: ['disney'],
        metadataVersion: 2,
        metadataComplete: true,
      },
    })
    const fallback = sharedMediaCatalogTitle(entry)

    expect(fallback).toMatchObject({
      tmdbId: 562,
      title: 'Stirb langsam',
      movieHubCatalog: true,
      sharedMediaFallback: true,
      metadataComplete: false,
    })
    expect(fallback.providerIds).toEqual(['moviehub'])
  })
})
