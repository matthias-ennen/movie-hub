import { describe, it, expect, vi } from 'vitest'
import { durationSeconds, stratifiedSelection, classifyVideo, sortedCandidates, readPlaylist,
  runInventoryPilot, MAX_VIDEOS, MAX_API_CALLS } from '../scripts/youtube-api-inventory-pilot.mjs'
import { SOURCES } from '../scripts/youtube-api-smoke.mjs'

const vid = (prefix, n) => prefix + String(n).padStart(10, '0')

describe('YouTube G1 larger inventory – pure data rules', () => {
  it('parses ISO 8601 durations without treating Shorts as feature films', () => {
    expect(durationSeconds('PT32S')).toBe(32)
    expect(durationSeconds('PT1H32M34S')).toBe(5554)
    expect(durationSeconds('P1DT1H')).toBe(90000)
    expect(durationSeconds('PT0S')).toBe(0)
    expect(durationSeconds('invalid')).toBeNull()
  })

  it('selects stable newer items and broad positions across a complete upload list', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => vid('N', i))
    const pick = stratifiedSelection(ids, 180)
    expect(pick).toHaveLength(180)
    expect(new Set(pick).size).toBe(180)
    expect(pick.slice(0, 20)).toEqual(ids.slice(0, 20))
    expect(pick.some((id) => ids.indexOf(id) > 950)).toBe(true)
    expect(stratifiedSelection(ids, 180)).toEqual(pick)
    expect(stratifiedSelection(ids.slice(0, 8), 200)).toHaveLength(8)
    expect(stratifiedSelection(ids, 0)).toEqual([])
  })

  it('flags short clips, foreign publisher, regional blocks and unknown lengths conservatively', () => {
    const video = (seconds, override = {}) => ({
      snippet: { channelId: SOURCES[0].channelId },
      status: { privacyStatus: 'public' },
      contentDetails: { duration: 'PT' + seconds + 'S' },
      ...override,
    })
    expect(classifyVideo(null, SOURCES[0].channelId)).toBe('missing-detail')
    expect(classifyVideo(video(32), SOURCES[0].channelId)).toBe('short')
    expect(classifyVideo(video(1800), SOURCES[0].channelId)).toBe('medium-uncertain')
    expect(classifyVideo(video(5400), SOURCES[0].channelId)).toBe('long-video-candidate')
    expect(classifyVideo(video(5400, { snippet: { channelId: 'wrong' } }), SOURCES[0].channelId)).toBe('foreign-channel')
    expect(classifyVideo(video(5400, { contentDetails: { duration: 'PT90M', regionRestriction: { blocked: ['DE'] } } }), SOURCES[0].channelId)).toBe('DE-blocked')
    expect(classifyVideo(video(5400, { contentDetails: { duration: 'PT90M', regionRestriction: { allowed: ['AT'] } } }), SOURCES[0].channelId)).toBe('DE-not-allowed')
  })

  it('sorts candidates only by available view count with deterministic ties', () => {
    const mk = (id, count) => ({ id, snippet: { channelId: SOURCES[0].channelId },
      contentDetails: { duration: 'PT90M' }, statistics: count == null ? {} : { viewCount: count } })
    const videos = [mk('C0000000001','2'), mk('C0000000002','9007199254740999'),
      mk('C0000000003',null), mk('C0000000004','20')]
    expect(sortedCandidates(videos, SOURCES[0].channelId).map((v) => v.id)).toEqual([
      'C0000000002','C0000000004','C0000000001','C0000000003',
    ])
  })

  it('follows all available pages and rejects malformed loops', async () => {
    const ids = [vid('N', 0), vid('N', 1), vid('N', 2)]
    const api = vi.fn(async (_, p) => ({
      items: [{ contentDetails: { videoId: ids[p.pageToken ? 2 : 0] } },
        ...(!p.pageToken ? [{ contentDetails: { videoId: ids[1] } }] : [])],
      ...(p.pageToken ? {} : { nextPageToken: 'next' }),
    }))
    expect((await readPlaylist(api, 'PLtest')).ids).toEqual(ids)
    expect(api).toHaveBeenCalledTimes(2)
    await expect(readPlaylist(async () => ({ items: [], nextPageToken: 'loop' }), 'PLtest'))
      .rejects.toThrow('Leere Playlist-Seite')
  })

  it('only emits a bounded nonproductive report from a 200-video stratified sample', async () => {
    const c = Array.from({ length: 3 }, (_, i) => vid('C', i))
    const n = Array.from({ length: 210 }, (_, i) => vid('N', i))
    const api = vi.fn(async (endpoint, params) => {
      if (endpoint === 'channels') return { items: SOURCES.map((source) => ({
        id: source.channelId, contentDetails: { relatedPlaylists: { uploads: 'UUNetzkino' } },
      })) }
      if (endpoint === 'playlists') return { items: [{
        id: params.id, contentDetails: { itemCount: params.id === SOURCES[0].playlistId ? c.length : n.length },
      }] }
      if (endpoint === 'playlistItems') {
        const ids = params.playlistId === SOURCES[0].playlistId ? c : n
        const page = Number(params.pageToken || 0)
        return { items: ids.slice(page * 50, (page + 1) * 50)
          .map((id) => ({ contentDetails: { videoId: id } })),
          ...((page + 1) * 50 < ids.length ? { nextPageToken: String(page + 1) } : {}) }
      }
      if (endpoint === 'videos') return { items: params.id.split(',').map((id) => ({
        id, snippet: { title: 'Film Test ' + id,
          channelId: id[0] === 'C' ? SOURCES[0].channelId : SOURCES[1].channelId },
        status: { privacyStatus: 'public' },
        contentDetails: { duration: id === n[0] ? 'PT32S' : 'PT1H25M',
          regionRestriction: { allowed: ['DE'] } },
        statistics: { viewCount: '1000' },
      })) }
      throw new Error('Wrong endpoint')
    })
    const x = await runInventoryPilot(api, new Date('2026-10-16T08:30:00Z'))
    expect(x.sampled).toBe(MAX_VIDEOS)
    expect(x.resolved).toBe(MAX_VIDEOS)
    expect(x.inventory.map((s) => s.ids)).toEqual([3,210])
    expect(x.counts).toEqual({ channels: 1, playlists: 2, playlistItems: 6, videos: 4 })
    expect(api.mock.calls.length).toBeLessThan(MAX_API_CALLS)
    expect(x.report).toContain('short=1')
    expect(x.report).toContain('nur innerhalb dieser Stichprobe')
    expect(x.report).toContain('TMDB-Matching / Rechte')
    expect(x.report).not.toContain('YOUTUBE_API_KEY')
  })
})
