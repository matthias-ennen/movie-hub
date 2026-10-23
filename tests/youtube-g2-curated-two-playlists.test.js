import { describe, it, expect, vi } from 'vitest'
import {
  playlistIdFromInput, validateTwoCuratedPlaylists,
  runTwoCuratedPlaylistAudit,
} from '../scripts/youtube-g2-curated-two-playlists.mjs'
const FREE = 'PL11111111111111111111111111111111'
const RENT = 'PL22222222222222222222222222222222'
const idA = 'Abc12345678', idB = 'Zbc12345678', idC = 'Mbc12345678'
const playlists = { free: 'https://www.youtube.com/playlist?list=' + FREE, rentBuy: RENT }
const video = id => ({
  id, snippet: {
    channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', channelTitle: 'Movie Channel',
    title: 'An Original Feature Film (1997)', categoryId: '30',
  },
  contentDetails: { duration: 'PT1H44M', regionRestriction: { allowed: ['DE'] } },
  status: { privacyStatus: 'public' },
})
function fixture({ playlistOwner = 'same', truncated = false, hidden = false } = {}) {
  const api = vi.fn(async (endpoint, args) => {
    if (endpoint === 'playlists') return { items: [
      { id: FREE, snippet: { channelId: 'UC222' }, status: { privacyStatus: 'unlisted' } },
      { id: RENT, snippet: { channelId: playlistOwner === 'same' ? 'UC222' : 'UC333' },
        status: { privacyStatus: hidden ? 'private' : 'public' } },
    ] }
    if (endpoint === 'playlistItems') {
      if (args.playlistId === FREE) return {
        items: [idA, idB].map((id, position) => ({
          contentDetails: { videoId: id }, snippet: { position },
        })),
        ...(truncated ? { nextPageToken: 'next' } : {}),
      }
      return { items: [idB, idC].map((id, position) => ({
        contentDetails: { videoId: id }, snippet: { position },
      })) }
    }
    if (endpoint === 'videos') return { items: args.id.split(',').map(video) }
    throw Error('Unexpected endpoint ' + endpoint)
  })
  return api
}
describe('G2 exactly two curated YouTube playlists', () => {
  it('accepts canonical playlists/links but refuses arbitrary URLs, duplicates and no IDs', () => {
    expect(playlistIdFromInput(playlists.free)).toBe(FREE)
    expect(playlistIdFromInput(RENT)).toBe(RENT)
    expect(playlistIdFromInput('https://evil.test/playlist?list=' + FREE)).toBeNull()
    expect(playlistIdFromInput('https://www.youtube.com/channel/abc?list=' + FREE)).toBeNull()
    expect(() => validateTwoCuratedPlaylists({ free: FREE, rentBuy: FREE }))
      .toThrow('TWO_DISTINCT_CURATED_PLAYLIST_IDS_REQUIRED')
    expect(() => validateTwoCuratedPlaylists({})).toThrow()
  })

  it('fetches only two editor-owned sources, deduplicates and stops at review', async () => {
    const api = fixture()
    const result = await runTwoCuratedPlaylistAudit({
      playlists, youtubeApi: api, at: () => '2026-10-22T13:00:00Z',
    })
    expect(result).toMatchObject({
      uniqueVideoIds: 3, fullyScanned: true, crossPlaylistConflicts: 1,
      independentlyVerifiedWorks: 0, verifiedDEOffers: 0,
      publicationPermitted: false, providerWrites: 0, catalogWrites: 0, firestoreWrites: 0,
      badgeWrites: 0, nightlyWrites: 0, calls: {
        playlists: 1, playlistItems: 2, videos: 1, search: 0, tmdb: 0,
      },
    })
    expect(result.candidates.find(x => x.videoId === idB)).toMatchObject({
      status: 'review-tmdb-work-identity',
      editorialOfferHint: 'free', playlistModes: ['free', 'rent-buy'],
      playlistIds: [FREE, RENT], verifiedOfferType: null,
      toImport: false, titleRef: null, playbackRoute: null,
    })
    expect(result.candidates.filter(x => x.status === 'review-tmdb-work-identity')).toHaveLength(3)
    expect(api.mock.calls.map(x => x[0])).toEqual(['playlists', 'playlistItems', 'playlistItems', 'videos'])
  })

  it('rejects private/inaccessible sources but allows two independently published playlists', async () => {
    await expect(runTwoCuratedPlaylistAudit({
      playlists, youtubeApi: fixture({ hidden: true }),
    })).rejects.toThrow('PLAYLIST_NOT_ACCESSIBLE_WITH_READ_ONLY_API_KEY')

    const result = await runTwoCuratedPlaylistAudit({
      playlists, youtubeApi: fixture({ playlistOwner: 'other' }),
      at: () => '2026-10-22T13:00:00Z',
    })
    expect(result.playlistsHaveSameOwner).toBe(false)
    expect(result.playlistOwnerChannelIds).toEqual(['UC222', 'UC333'])
    expect(result.playlistSummaries.map(x => x.ownerChannelId)).toEqual(['UC222', 'UC333'])
    expect(result.uniqueVideoIds).toBe(3)
    expect(result.crossPlaylistConflicts).toBe(1)
    expect(result.candidates.find(x => x.videoId === idB).editorialOfferHint).toBe('free')
    expect(result.publicationPermitted).toBe(false)
    expect(result.providerWrites).toBe(0)
    expect(result.catalogWrites).toBe(0)
    expect(result.firestoreWrites).toBe(0)
  })

  it('marks incomplete paging without pretending an exhaustive inventory', async () => {
    const result = await runTwoCuratedPlaylistAudit({ playlists,
      youtubeApi: fixture({ truncated: true }), at: () => '2026-10-22T13:00:00Z' })
    expect(result.uniqueVideoIds).toBe(3)
    expect(result.fullyScanned).toBe(false)
    expect(result.playlistSummaries[0].fullyScanned).toBe(false)
    expect(result.publicationPermitted).toBe(false)
  })

  it('never calls search or TMDB and cannot claim rent/buy or free verified', async () => {
    const result = await runTwoCuratedPlaylistAudit({ playlists, youtubeApi: fixture() })
    expect(result.candidates.every(c => !c.accepted && !c.toImport
      && c.verifiedOfferType === null && c.playbackRoute === null)).toBe(true)
    expect(result.calls.search).toBe(0)
    expect(result.calls.tmdb).toBe(0)
  })
})
