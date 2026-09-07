import { describe, expect, it } from 'vitest'
import { normaliseMedia, normalizeMediaUrl, normalizeSmbUrl, titleMediaKey } from '../src/library/sharedMediaModel.js'

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
})
