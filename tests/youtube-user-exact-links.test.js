import { describe, expect, it } from 'vitest'
import { canonicalYouTubeWatchUrl, requireYouTubeWatchUrl, youtubeVideoIdFromUrl } from '../src/providers/youtubeExactLink.js'
import { normaliseMedia, normalizeMediaUrl } from '../src/library/sharedMediaModel.js'

const ID = 'KQeEIbN296U'
const WATCH = 'https://www.youtube.com/watch?v=' + ID

describe('user-created YouTube watch links: safe integration without a provider feed', () => {
  it('normalizes short mobile and shared tracking URLs to exact canonical watch destination', () => {
    for (const source of [
      'https://youtu.be/' + ID + '?si=tracking-code',
      'http://m.youtube.com/watch?feature=shared&v=' + ID,
      'https://www.youtube.com/watch?v=' + ID + '&list=PLAYLIST',
      'https://youtube.com/watch?v=' + ID + '#time',
    ]) {
      expect(youtubeVideoIdFromUrl(source)).toBe(ID)
      expect(canonicalYouTubeWatchUrl(source)).toBe(WATCH)
      expect(normalizeMediaUrl(source)).toBe(WATCH)
    }
  })

  it('rejects identity tricks, playlists, search pages, bad schemes and duplicate video IDs', () => {
    const invalid = [
      'https://youtube.com.evil.example/watch?v=' + ID,
      'https://notyoutube.com/watch?v=' + ID,
      'javascript:alert(1)',
      'https://www.youtube.com/results?search_query=film',
      'https://www.youtube.com/playlist?list=PLABC',
      'https://www.youtube.com/watch?v=' + ID + '&v=DIFFERENT1',
      'https://user:password@www.youtube.com/watch?v=' + ID,
      'https://www.youtube.com:8443/watch?v=' + ID,
      'https://youtu.be/not-a-real-video-id',
      ID,
    ]
    for (const candidate of invalid) {
      expect(canonicalYouTubeWatchUrl(candidate)).toBeNull()
      expect(() => requireYouTubeWatchUrl(candidate)).toThrow(/YouTube-Videolink/)
    }
  })

  it('persists a manually linked YouTube video as personal web link, not a provider offer', () => {
    const result = normaliseMedia({
      label: 'Mein YouTube-Link', url: 'https://youtu.be/' + ID + '?si=track', type: 'youtube',
    })
    expect(result).toEqual({
      id: undefined,
      label: 'Mein YouTube-Link',
      url: WATCH,
      type: 'web',
    })
    expect(result).not.toHaveProperty('providerId')
    expect(result).not.toHaveProperty('offerTypes')
    expect(result).not.toHaveProperty('tmdbId')
  })

  it('does not alter user bookmarks to other sites, YouTube search or non-YouTube videos', () => {
    expect(normalizeMediaUrl('https://example.org/watch?v=' + ID)).toBe('https://example.org/watch?v=' + ID)
    expect(normalizeMediaUrl('https://www.youtube.com/results?search_query=movie'))
      .toBe('https://www.youtube.com/results?search_query=movie')
  })
})
