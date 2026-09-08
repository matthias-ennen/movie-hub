import { describe, expect, it } from 'vitest'
import { normaliseMedia, normalizeMediaUrl, normalizeProviderUrl, normalizeSmbUrl, titleMediaKey } from '../src/library/sharedMediaModel.js'

describe('gemeinsame Movie-Hub-Medien', () => {
  it('uses a media-type-qualified key so movie and series ids cannot collide', () => {
    expect(titleMediaKey({ tmdbId: 11, type: 'movie' })).toBe('movie-11')
    expect(titleMediaKey({ tmdbId: 11, type: 'series' })).toBe('series-11')
  })

  it('accepts reachable HTTP(S) web and video addresses', () => {
    expect(normaliseMedia({ label: ' NAS ', url: 'http://192.168.1.20/video.mp4', type: 'video' }))
      .toMatchObject({ label: 'NAS', url: 'http://192.168.1.20/video.mp4', type: 'video' })
    expect(normalizeMediaUrl('https://example.com/watch')).toBe('https://example.com/watch')
  })

  it('normalizes SMB and UNC paths without embedding credentials', () => {
    expect(normaliseMedia({ label: 'FRITZ NAS', url: 'smb://fritz.box/FRITZ.NAS/Filme/Test.mp4', type: 'smb' }))
      .toMatchObject({ label: 'FRITZ NAS', url: 'smb://fritz.box/FRITZ.NAS/Filme/Test.mp4', type: 'smb' })
    expect(normalizeSmbUrl('\\\\fritz.box\\FRITZ.NAS\\Meine Filme\\Test.mkv'))
      .toBe('smb://fritz.box/FRITZ.NAS/Meine%20Filme/Test.mkv')
    expect(() => normalizeSmbUrl('smb://user:secret@fritz.box/FRITZ.NAS/Test.mp4')).toThrow(/Kennwort/)
  })

  it('rejects local files, scripts and malformed SMB paths', () => {
    for (const url of ['file:///sdcard/video.mp4', 'smb://nas/video.mkv', 'javascript:alert(1)']) {
      expect(() => normalizeMediaUrl(url)).toThrow(/HTTP/)
    }
    expect(() => normalizeSmbUrl('smb://fritz.box/FRITZ.NAS')).toThrow(/Freigabe/)
  })

  it('requires a visible label', () => {
    expect(() => normaliseMedia({ label: ' ', url: 'https://example.com', type: 'web' }))
      .toThrow(/Bezeichnung/)
  })

  it('accepts exact HTTPS links only on the selected provider domains', () => {
    expect(normaliseMedia({
      label: 'Netflix direkt',
      url: 'https://www.netflix.com/title/81914143?trackId=123',
      type: 'provider',
      providerId: 'netflix',
    })).toMatchObject({
      label: 'Netflix direkt',
      url: 'https://www.netflix.com/title/81914143?trackId=123',
      type: 'provider',
      providerId: 'netflix',
    })
    expect(normalizeProviderUrl('https://www.amazon.de/gp/video/detail/B0GCKBV5DQ', 'prime'))
      .toBe('https://www.amazon.de/gp/video/detail/B0GCKBV5DQ')
    expect(normalizeProviderUrl('https://www.primevideo.com/detail/example', 'prime'))
      .toBe('https://www.primevideo.com/detail/example')
    expect(normalizeProviderUrl('https://www.disneyplus.com/browse/entity-example', 'disney'))
      .toBe('https://www.disneyplus.com/browse/entity-example')
    expect(normalizeProviderUrl('https://youtu.be/KQeEIbN296U', 'youtube'))
      .toBe('https://youtu.be/KQeEIbN296U')
    expect(normalizeProviderUrl('https://www.waipu.tv/program/example', 'waipu'))
      .toBe('https://www.waipu.tv/program/example')
  })

  it('rejects foreign, mismatched and insecure provider links', () => {
    expect(() => normalizeProviderUrl('https://netflix.com.example.org/title/123', 'netflix'))
      .toThrow(/passt nicht/)
    expect(() => normalizeProviderUrl('https://www.netflix.com/title/123', 'disney'))
      .toThrow(/passt nicht/)
    expect(() => normalizeProviderUrl('http://www.netflix.com/title/123', 'netflix'))
      .toThrow(/HTTPS/)
    expect(() => normalizeProviderUrl('https://user:secret@www.netflix.com/title/123', 'netflix'))
      .toThrow(/Zugangsdaten/)
    expect(() => normalizeProviderUrl('https://www.netflix.com/title/123', 'unknown'))
      .toThrow(/unterstützten Anbieter/)
  })
})
