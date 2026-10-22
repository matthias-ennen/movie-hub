/**
 * Two curated user-owned YouTube playlists -> exact video-ID inventory.
 * A playlist's label is an editorial HINT, not a confirmed DE offer.
 * Do not write source data to the MovieHub catalog, badges or Firestore.
 */
import { normalizeYoutubeVideoCandidate } from '../src/sources/adapters/youtubeContractMapper.js'

export const YOUTUBE_CURATED_PLAYLIST_MODES = Object.freeze(['free', 'rent-buy'])
export const YOUTUBE_CURATED_MAX_PAGES_PER_LIST = 5
export const YOUTUBE_CURATED_PAGE_SIZE = 50
export const YOUTUBE_CURATED_MAX_VIDEOS = 500
const VALID_PLAYLIST_ID = /^PL[A-Za-z0-9_-]{10,120}$/
const VALID_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const safe = v => String(v ?? '').replace(/[\r\n<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)

export function playlistIdFromInput(input) {
  const value = String(input ?? '').trim()
  if (VALID_PLAYLIST_ID.test(value)) return value
  try {
    const uri = new URL(value)
    if (uri.protocol !== 'https:' ||
      !['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(uri.hostname)
      || !['/playlist', '/watch'].includes(uri.pathname)) return null
    const id = uri.searchParams.get('list')
    return VALID_PLAYLIST_ID.test(id || '') ? id : null
  } catch { return null }
}

export function validateTwoCuratedPlaylists({ free, rentBuy } = {}) {
  const freeId = playlistIdFromInput(free)
  const rentBuyId = playlistIdFromInput(rentBuy)
  if (!freeId || !rentBuyId || freeId === rentBuyId) {
    throw new Error('TWO_DISTINCT_CURATED_PLAYLIST_IDS_REQUIRED')
  }
  return Object.freeze([
    Object.freeze({ mode: 'free', playlistId: freeId }),
    Object.freeze({ mode: 'rent-buy', playlistId: rentBuyId }),
  ])
}

export async function runTwoCuratedPlaylistAudit({
  playlists, youtubeApi, at = () => new Date().toISOString(),
} = {}) {
  if (typeof youtubeApi !== 'function') throw new Error('READ_ONLY_YOUTUBE_CALLBACK_REQUIRED')
  const sources = validateTwoCuratedPlaylists(playlists)
  const observedAt = new Date(at()).toISOString()
  const calls = { playlists: 0, playlistItems: 0, videos: 0, search: 0, tmdb: 0 }
  const get = async (endpoint, params) => {
    if (!Object.hasOwn(calls, endpoint) || ['search', 'tmdb'].includes(endpoint)) {
      throw new Error('CURATED_ENDPOINT_NOT_ALLOWED')
    }
    const max = endpoint === 'playlists' ? 1 : endpoint === 'playlistItems' ? 10 : 10
    if (++calls[endpoint] > max) throw new Error('CURATED_CALL_BUDGET_EXCEEDED')
    return youtubeApi(endpoint, params)
  }
  const meta = await get('playlists', {
    part: 'snippet,status', id: sources.map(x => x.playlistId).join(','),
  })
  const byId = new Map((meta?.items || []).map(x => [x.id, x]))
  const owners = new Set()
  for (const source of sources) {
    const playlist = byId.get(source.playlistId)
    const owner = playlist?.snippet?.channelId
    const privacy = playlist?.status?.privacyStatus
    if (!owner || !['public', 'unlisted'].includes(privacy)) {
      throw new Error('PLAYLIST_NOT_ACCESSIBLE_WITH_READ_ONLY_API_KEY')
    }
    owners.add(owner)
  }
  if (owners.size !== 1) throw new Error('CURATED_PLAYLISTS_MUST_HAVE_SAME_OWNER')
  const rows = new Map()
  const perPlaylist = []
  for (const source of sources) {
    const foundIds = new Set()
    let token = null
    let pages = 0
    do {
      const answer = await get('playlistItems', {
        part: 'contentDetails,snippet', playlistId: source.playlistId,
        maxResults: YOUTUBE_CURATED_PAGE_SIZE,
        ...(token ? { pageToken: token } : {}),
      })
      pages++
      for (const item of answer?.items || []) {
        const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId
        if (!VALID_VIDEO_ID.test(String(videoId || ''))) continue
        foundIds.add(videoId)
        if (!rows.has(videoId)) rows.set(videoId, {
          videoId, playlistModes: [], playlistIds: [], playlistPositions: {},
        })
        const row = rows.get(videoId)
        if (!row.playlistModes.includes(source.mode)) {
          row.playlistModes.push(source.mode)
          row.playlistIds.push(source.playlistId)
        }
        row.playlistPositions[source.mode] = Number.isInteger(item?.snippet?.position)
          ? item.snippet.position : null
      }
      token = typeof answer?.nextPageToken === 'string' && answer.nextPageToken
        ? answer.nextPageToken : null
    } while (token && pages < YOUTUBE_CURATED_MAX_PAGES_PER_LIST)
    perPlaylist.push({
      mode: source.mode, playlistId: source.playlistId, pages,
      distinctVideoIds: foundIds.size, fullyScanned: token === null,
    })
  }
  if (rows.size > YOUTUBE_CURATED_MAX_VIDEOS) {
    throw new Error('CURATED_VIDEO_BUDGET_EXCEEDED')
  }
  const ids = [...rows.keys()]
  const details = new Map()
  for (let i = 0; i < ids.length; i += 50) {
    const answer = await get('videos', {
      part: 'snippet,contentDetails,status',
      id: ids.slice(i, i + 50).join(','),
    })
    for (const v of answer?.items || []) {
      if (VALID_VIDEO_ID.test(String(v?.id || '')) && ids.includes(v.id)) {
        details.set(v.id, v)
      }
    }
  }
  const candidates = ids.map(id => {
    const row = rows.get(id)
    const raw = details.get(id)
    const video = raw ? normalizeYoutubeVideoCandidate(raw, { observedAt }) : null
    const conflict = row.playlistModes.length !== 1
    const disposition = conflict ? 'review-conflicting-curation'
      : !video ? 'review-video-missing-or-private'
      : !video.screening.eligible ? 'review-screening-rejected'
      : 'review-tmdb-work-identity'
    return {
      ...row, videoTitle: video ? safe(video.title) : null,
      channelId: video?.channelId || null,
      channelTitle: video?.channelTitle || null,
      minutes: video?.minutes ?? null,
      deRegionSignal: video?.deRegionSignal || 'unknown',
      editorialOfferHint: conflict ? 'ambiguous' : row.playlistModes[0],
      verifiedOfferType: null,
      youtubeWatchUrl: video?.watchUrl || null,
      status: disposition, screened: video?.screening?.eligible === true,
      titleRef: null, accepted: false,
      toImport: false, playbackRoute: null,
    }
  })
  const totals = Object.fromEntries([...new Set(candidates.map(x => x.status))]
    .map(status => [status, candidates.filter(x => x.status === status).length]))
  return {
    mode: 'CURATED_TWO_PLAYLISTS_READ_ONLY',
    observedAt, editorChannelId: [...owners][0],
    playlistSummaries: perPlaylist, uniqueVideoIds: ids.length,
    crossPlaylistConflicts: candidates.filter(x => x.playlistModes.length !== 1).length,
    fullyScanned: perPlaylist.every(x => x.fullyScanned),
    counts: totals, calls,
    independentlyVerifiedWorks: 0, verifiedDEOffers: 0,
    publicationPermitted: false, catalogWrites: 0,
    firestoreWrites: 0, providerWrites: 0, badgeWrites: 0, nightlyWrites: 0,
    candidates,
  }
}
