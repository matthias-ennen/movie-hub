import { describe, expect, it, vi } from 'vitest'
import {
  selectYoutubeBadgedMovies, selectExplicitYoutubeBadgedMovies, exactYoutubeProviderIds,
  exactDeYoutubeOfferTypes, evaluateTmdbFirstYoutubeLinks,
} from '../scripts/youtube-g2-tmdb-first-link-model.mjs'
import {
  runTmdbFirstLinkPilot,
  pilotMarkdown,
  PUBLIC_INDEX,
  loadPublicMovieHubIndex,
} from '../scripts/youtube-g2-tmdb-first-link-pilot.mjs'

const now = '2026-10-22T12:00:00.000Z'
const entries = Array.from({ length: 150 }, (_, i) => ({
  id: 'tmdb-movie-' + (i + 1),
  tmdbId: i + 1, type: 'movie', title: 'Film ' + (i + 1),
  originalTitle: 'Film ' + (i + 1), year: 2000,
  providerIds: i === 110 ? ['youtube'] : ['prime'],
}))
entries[110] = {
  ...entries[110], title: 'Iron Soldier', originalTitle: 'Iron Soldier', year: 2011,
  providerOffers: [{ id: 'youtube', offerTypes: ['rent', 'buy'] }],
}
const publicIndex = {
  kind: 'search-index', version: 1, source: 'tmdb', country: 'DE',
  generatedAt: '2026-10-22T10:00:00.000Z', count: 150, entries,
}
const movie = { id: 111, title: 'Iron Soldier', original_title: 'Iron Soldier',
  release_date: '2011-01-01', runtime: 95, alternative_titles: { titles: [] },
  credits: { crew: [] } }
const video = (id, title = 'Iron Soldier (2011) [Action] Ganzer Film auf Deutsch') => ({
  id, snippet: { title, channelTitle: 'Publisher', channelId: 'UClyuw-OWE6taGFv0reZI6eQ',
    categoryId: '30', publishedAt: '2020-01-01T00:00:00Z' },
  contentDetails: { duration: 'PT1H35M', regionRestriction: { allowed: ['DE'] } },
  status: { privacyStatus: 'public' },
})
const validVideo = video('Abc12345678')
const ytApi = vi.fn(async (endpoint) => endpoint === 'search'
  ? { items: [{ id: { videoId: validVideo.id } }] }
  : { items: [validVideo] })
const tmdbApi = vi.fn(async (path) => {
  if (path === '/watch/providers/movie') return { results: [
    { provider_name: 'YouTube', provider_id: 192 },
    { provider_name: 'Google TV', provider_id: 3 },
  ] }
  if (path === '/movie/111/watch/providers') return { results: { DE: {
    rent: [{ provider_id: 192 }], buy: [{ provider_id: 192 }],
    free: [{ provider_id: 3 }],
  } } }
  if (path === '/movie/111') return movie
  throw Error('Unexpected TMDB path: ' + path)
})

describe('YouTube G2 TMDB-FIRST – existing badge -> review-only direct link candidates', () => {
  it('selects MovieHub YouTube-badged movies, never Google TV-only or unbadged titles', () => {
    const selection = selectYoutubeBadgedMovies(publicIndex)
    expect(selection.publicYoutubeBadgedMovies).toBe(1)
    expect(selection.selected.map(x => x.tmdbId)).toEqual([111])
    expect(selection.selected[0].mediaType).toBe('movie')
    expect(() => selectYoutubeBadgedMovies({ ...publicIndex, source: 'fallback' })).toThrow()
    expect(() => selectYoutubeBadgedMovies(publicIndex, { limit: 100 })).toThrow()
  })

  it('uses only explicit FULL-inventory movie seeds that have exact YouTube badges', async () => {
    const s=selectExplicitYoutubeBadgedMovies(publicIndex, [
      {mediaType:'movie',tmdbId:111},
    ],{limit:10})
    expect(s.selectionMode).toBe('explicit-full-canonical-inventory-batch')
    expect(s.selected).toHaveLength(1)
    expect(s.selected[0].title).toBe('Iron Soldier')
    expect(s.publicYoutubeBadgedMovies).toBe(1)
    expect(()=>selectExplicitYoutubeBadgedMovies(publicIndex, [
      {mediaType:'movie',tmdbId:1},
    ],{limit:10})).toThrow('TMDB_FIRST_EXPLICIT_BADGE_IDENTITY_INVALID')
    expect(()=>selectExplicitYoutubeBadgedMovies(publicIndex, [
      {mediaType:'series',tmdbId:111},
    ],{limit:10})).toThrow('TMDB_FIRST_EXPLICIT_BADGE_IDENTITY_INVALID')
    expect(()=>selectExplicitYoutubeBadgedMovies(publicIndex, [
      {mediaType:'movie',tmdbId:111},{mediaType:'movie',tmdbId:111},
    ],{limit:10})).toThrow('TMDB_FIRST_EXPLICIT_BADGE_IDENTITY_INVALID')
    ytApi.mockClear();tmdbApi.mockClear()
    const result=await runTmdbFirstLinkPilot({
      publicIndex,seedRefs:[{mediaType:'movie',tmdbId:111}],limit:10,
      tmdbGet:tmdbApi,youtubeApi:ytApi,now:()=>now,
    })
    expect(result.summary).toMatchObject({
      processedMovies:1,verifiedDirectLinks:0,publicationPermitted:false,
      firestoreWrites:0,badgeWrites:0,
    })
    expect(result.summary.calls.youtubeSearches).toBe(2)
  })

  it('checks exact DE YouTube provider+offer pairing, not Google TV', () => {
    const providers = exactYoutubeProviderIds({ results: [
      { provider_name: 'YouTube', provider_id: 192 },
      { provider_name: 'YouTube Free', provider_id: 235 },
      { provider_name: 'Google TV', provider_id: 3 },
    ] })
    expect(providers).toEqual([192])
    expect(exactDeYoutubeOfferTypes({ results: { DE: {
      rent: [{ provider_id: 192 }], free: [{ provider_id: 3 }],
      buy: [{ provider_id: 235 }],
    } } }, providers)).toEqual(['rent'])
  })

  it('returns only a review candidate, never an activated provider route', () => {
    const seed = selectYoutubeBadgedMovies(publicIndex).selected[0]
    const result = evaluateTmdbFirstYoutubeLinks(seed, movie, ['rent', 'buy'], [validVideo],
      { observedAt: now })
    expect(result.status).toBe('review-single-video-candidate')
    expect(result.videoCandidates[0]).toMatchObject({
      videoId: validVideo.id, titleLevel: 4, strong: true,
    })
    expect(result.directPlaybackRoute).toBeNull()
    expect(result.reviewedVideoId).toBeNull()
    expect(result.publicationPermitted).toBe(false)
    expect(result.tmdbDeOfferTypes).toEqual(['rent', 'buy'])
  })

  it('rejects weak/conflicting video metadata and distinct video editions', () => {
    const seed = selectYoutubeBadgedMovies(publicIndex).selected[0]
    const conflict = evaluateTmdbFirstYoutubeLinks(seed, movie, ['rent'], [
      video('Zbc12345678', 'Iron Soldier (2001) [Action] Ganzer Film auf Deutsch'),
    ], { observedAt: now })
    expect(conflict.status).toBe('review-weak-or-unresolved-videos')
    const ambiguous = evaluateTmdbFirstYoutubeLinks(seed, movie, ['rent'], [
      validVideo, video('Zbc12345678'),
    ], { observedAt: now })
    expect(ambiguous.status).toBe('review-multiple-video-editions')
    expect(ambiguous.directPlaybackRoute).toBeNull()
  })

  it('skips missing current DE YouTube detail offers, even if public badge exists', () => {
    const result = evaluateTmdbFirstYoutubeLinks(
      selectYoutubeBadgedMovies(publicIndex).selected[0], movie, [], [validVideo], { observedAt: now })
    expect(result.status).toBe('no-current-tmdb-de-youtube-offer')
    expect(result.videoCandidates).toEqual([])
    expect(result.directPlaybackRoute).toBeNull()
  })

  it('runs a fully bounded real-API-shaped reverse research pilot with zero writes', async () => {
    ytApi.mockClear(); tmdbApi.mockClear()
    const result = await runTmdbFirstLinkPilot({
      publicIndex, tmdbGet: tmdbApi, youtubeApi: ytApi,
      now: () => now,
    })
    expect(result.summary).toMatchObject({
      processedMovies: 1,
      statusCounts: { 'review-single-video-candidate': 1 },
      candidateLinksForReview: 1,
      verifiedDirectLinks: 0,
      publicationPermitted: false,
      catalogWrites: 0, firestoreWrites: 0, providerWrites: 0,
      badgeWrites: 0, nightlyWrites: 0,
    })
    expect(result.summary.calls).toEqual({
      youtubeSearches: 2, youtubeVideoLookups: 1, tmdbGetRequests: 3,
    })
    expect(result.rows[0].reviewedVideoId).toBeNull()
    expect(pilotMarkdown(result)).toContain('Verified direct routes: 0')
    expect(ytApi.mock.calls.map(c => c[0])).toEqual(['search', 'search', 'videos'])
  })

  it('paces every search after the first without retrying or changing matcher result', async()=>{
    const wait=vi.fn(async()=>{})
    const api=vi.fn(async (path)=>path==='search'
      ?{items:[{id:{videoId:validVideo.id}}]}:{items:[validVideo]})
    const r=await runTmdbFirstLinkPilot({
      publicIndex,tmdbGet:tmdbApi,youtubeApi:api,
      minimumSearchIntervalMs:20000,waitBetweenSearches:wait,
      now:()=>now,
    })
    expect(r.summary.calls.youtubeSearches).toBe(2)
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith(20000)
    expect(api.mock.calls.map(c=>c[0])).toEqual(['search','search','videos'])
    expect(r.summary.verifiedDirectLinks).toBe(0)
    expect(r.rows[0].directPlaybackRoute).toBeNull()
  })
  it('fails closed on invalid pacing before any external requests',async()=>{
    const api=vi.fn()
    await expect(runTmdbFirstLinkPilot({
      publicIndex,youtubeApi:api,tmdbGet:api,
      minimumSearchIntervalMs:-1,now:()=>now,
    })).rejects.toThrow('YOUTUBE_SEARCH_SPACING_INVALID')
    expect(api).not.toHaveBeenCalled()
  })

  it('stops stale indexes and missing current source provider before search', async () => {
    await expect(runTmdbFirstLinkPilot({
      publicIndex: { ...publicIndex, generatedAt: '2025-01-01T00:00:00Z' },
      tmdbGet: tmdbApi, youtubeApi: ytApi, now: () => now,
    })).rejects.toThrow('PUBLISHED_INDEX_STALE_OR_FUTURE')
    await expect(runTmdbFirstLinkPilot({
      publicIndex, now: () => now, youtubeApi: ytApi,
      tmdbGet: async () => ({ results: [{ provider_name: 'Google TV', provider_id: 3 }] }),
    })).rejects.toThrow('NO_EXACT_TMDB_YOUTUBE_PROVIDER')
  })

  it('fetches only the official published MovieHub index without redirects', async () => {
    const body = JSON.stringify(publicIndex)
    const request = vi.fn(async url => ({
      ok: true, status: 200, url,
      headers: { get: () => String(body.length) },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    }))
    const result = await loadPublicMovieHubIndex(request)
    expect(result.count).toBe(150)
    expect(request.mock.calls[0][0]).toBe(PUBLIC_INDEX)
    expect(request.mock.calls[0][1].redirect).toBe('error')
    await expect(loadPublicMovieHubIndex(async () => ({
      ok: true, status: 200, url: 'https://example.com/search-index.json',
    }))).rejects.toThrow('PUBLISHED_INDEX_FETCH_FAILED')
  })
})
