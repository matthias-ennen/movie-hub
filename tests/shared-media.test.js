import { describe, expect, it } from 'vitest'
import { normaliseMedia, normalizeMediaUrl, titleMediaKey } from '../src/library/sharedMediaModel.js'

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

  it('rejects local file, SMB and script schemes', () => {
    for (const url of ['file:///sdcard/video.mp4', 'smb://nas/video.mkv', 'javascript:alert(1)']) {
      expect(() => normalizeMediaUrl(url)).toThrow(/HTTP/)
    }
  })

  it('requires a visible label', () => {
    expect(() => normaliseMedia({ label: ' ', url: 'https://example.com', type: 'web' }))
      .toThrow(/Bezeichnung/)
  })
})
