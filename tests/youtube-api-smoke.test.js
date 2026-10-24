import { describe, it, expect, vi } from 'vitest'
import { getRegionSignal, isVideoId, safeTitle, runSmoke, youtubeGet, SOURCES } from '../scripts/youtube-api-smoke.mjs'

describe('YouTube G1 read-only smoke contracts', () => {
  it('keeps region metadata distinct from proven playback', () => {
    expect(getRegionSignal(undefined)).toContain('ungeprüft')
    expect(getRegionSignal({ blocked: ['DE'] })).toContain('gesperrt')
    expect(getRegionSignal({ allowed: ['FR', 'DE'] })).toContain('Freigabeliste')
    expect(getRegionSignal({ allowed: ['FR'] })).toContain('nicht')
  })

  it('rejects malformed video IDs and strips unsafe markdown from video titles', () => {
    expect(isVideoId('abcdefghijk')).toBe(true)
    expect(isVideoId('invalid')).toBe(false)
    expect(safeTitle('Test | [Film]\n<script>')).not.toMatch(/[|<>\n\[\]]/)
  })

  it('passes an API key only as a header and sanitizes error reporting', async () => {
    const fakeKey = 'fake-test-key-that-is-not-real'
    const calls = []
    const success = async (url, options) => {
      calls.push({ url: String(url), headers: options.headers })
      return { ok: true, json: async () => ({ items: [] }) }
    }
    await youtubeGet('videos', { part: 'snippet', id: 'abcdefghijk' }, fakeKey, success)
    expect(calls[0].url).not.toContain(fakeKey)
    expect(calls[0].headers['x-goog-api-key']).toBe(fakeKey)
    const errorResponse = async () => ({ ok: false, status: 403 })
    await expect(youtubeGet('videos', { id: 'abcdefghijk' }, fakeKey, errorResponse)).rejects.toThrow('HTTP 403')
    try {
      await youtubeGet('videos', { id: 'abcdefghijk' }, fakeKey, errorResponse)
    } catch (error) {
      expect(error.message).not.toContain(fakeKey)
    }
  })

  it('classifies known quota/rate failures but never leaks raw error metadata or API key', async () => {
    const apiKey='SENSITIVE_KEY_MUST_NOT_APPEAR'
    const privateMessage='SENSITIVE_RAW_ERROR_BODY_MUST_NOT_APPEAR'
    const responseFor=(reason)=>async()=>({
      ok:false,status:429,json:async()=>({error:{
        status:'UNKNOWN',message:privateMessage,
        errors:[{reason,message:privateMessage}],
      }}),
    })
    for(const [reason,expected] of [
      ['quotaExceeded','QUOTA_EXHAUSTED'],
      ['dailyLimitExceeded','QUOTA_EXHAUSTED'],
      ['rateLimitExceeded','RATE_LIMITED'],
      ['userRateLimitExceeded','RATE_LIMITED'],
      ['otherValue','RATE_LIMIT_OR_QUOTA_UNCLASSIFIED'],
    ]){
      try{
        await youtubeGet('search',{q:'movie',part:'snippet'},apiKey,responseFor(reason))
        throw Error('Expected the API request to fail')
      }catch(error){
        expect(error.message).toContain('HTTP 429')
        expect(error.message).toContain(expected)
        expect(error.message).not.toContain(apiKey)
        expect(error.message).not.toContain(privateMessage)
        expect(error.message).not.toContain(reason)
      }
    }
    const invalidBody=async()=>({ok:false,status:429,
      json:async()=>{throw Error(privateMessage)}})
    await expect(youtubeGet('search',{q:'movie'},apiKey,invalidBody))
      .rejects.toThrow('RATE_LIMIT_OR_QUOTA_UNCLASSIFIED')
  })

  it('reports both publishers, without inferring legal full films or TMDB matches', async () => {
    const first = 'abcdefghijk'
    const second = 'zbcdefghijk'
    const api = vi.fn(async (endpoint, params) => {
      if (endpoint === 'channels') return { items: SOURCES.map((source) => ({
        id: source.channelId,
        contentDetails: { relatedPlaylists: { uploads: 'UUfakeNetzkinoPlaylist' } },
      })) }
      if (endpoint === 'playlists') return { items: [{
        id: params.id, contentDetails: { itemCount: 99 },
      }] }
      if (endpoint === 'playlistItems') return { items: [{
        contentDetails: { videoId: params.playlistId === SOURCES[0].playlistId ? first : second },
      }] }
      if (endpoint === 'videos') return { items: [
        { id: first, snippet: { title: 'Sample A' }, contentDetails: { duration: 'PT95M', regionRestriction: { blocked: ['DE'] } } },
        { id: second, snippet: { title: 'Sample B' }, contentDetails: { duration: 'PT90M' } },
      ] }
      throw new Error('Unexpected endpoint')
    })
    const report = await runSmoke(api)
    expect(api).toHaveBeenCalledTimes(6)
    expect(report).toContain('CiNENET Deutschland')
    expect(report).toContain('Netzkino')
    expect(report).toContain('DE gesperrt')
    expect(report).toContain('nicht bestimmt')
    expect(report).toContain('nicht ausgeführt')
    expect(report).not.toContain('fake-test-key')
  })
})
