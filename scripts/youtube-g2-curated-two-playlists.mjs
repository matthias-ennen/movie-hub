/**
 * Two explicitly configured YouTube playlists -> exact video-ID inventory.
 * A playlist's label is an editorial HINT, not a confirmed DE offer.
 * Do not write source data to the MovieHub catalog, badges or Firestore.
 */
import { normalizeYoutubeVideoCandidate } from '../src/sources/adapters/youtubeContractMapper.js'

export const YOUTUBE_CURATED_PLAYLIST_MODES = Object.freeze(['free', 'rent-buy'])
export const YOUTUBE_ALL_PLAYLIST_MODES = Object.freeze(['free','flatrate','ads','rent-buy','rent','buy'])
export const PLAYLIST_OFFER_PRIORITY = Object.freeze([...YOUTUBE_ALL_PLAYLIST_MODES])
export function preferredConfiguredPlaylistMode(modes) {
  return PLAYLIST_OFFER_PRIORITY.find(mode => Array.isArray(modes) && modes.includes(mode)) || null
}
export function classForPlaylistMode(mode) {
  return ({free:'FREE',flatrate:'FLAT',ads:'ADS','rent-buy':'R&B',rent:'RENT',buy:'BUY'})[mode] || null
}
export function modeForPlaylistClass(klass) {
  return ({FREE:'free',FLAT:'flatrate',ADS:'ads','R&B':'rent-buy',RENT:'rent',BUY:'buy'})[klass] || null
}
export function validateConfiguredPlaylists(sources) {
  if (!Array.isArray(sources) || sources.length < 1) throw Error('YOUTUBE_ADMIN_NO_ENABLED_PLAYLISTS')
  const used = new Set()
  return sources.map(source => {
    const playlistId = playlistIdFromInput(source?.playlistId)
    if (!playlistId || used.has(playlistId) || !YOUTUBE_ALL_PLAYLIST_MODES.includes(source.mode)) {
      throw Error('YOUTUBE_ADMIN_PLAYLIST_INVALID_OR_DUPLICATE')
    }
    used.add(playlistId)
    return Object.freeze({playlistId, mode:source.mode, name:String(source.name||'').slice(0,100)})
  })
}
// The user-defined editorial precedence is independent of offer verification.
export function preferredCuratedPlaylistMode(modes) {
  if (!Array.isArray(modes)) return null
  if (modes.includes('free')) return 'free'
  return modes.includes('rent-buy') ? 'rent-buy' : null
}
export const YOUTUBE_CURATED_MAX_PAGES_PER_LIST = 5
export const YOUTUBE_CURATED_PAGE_SIZE = 50
export const YOUTUBE_CURATED_MAX_VIDEOS = 500
// Dynamic Admin sources may contain substantially more than 1,000 playlist items.
// Keep the entire read bounded; never claim completeness after a truncated scan.
export const YOUTUBE_CURATED_DYNAMIC_MAX_PAGES_PER_LIST = 200
export const YOUTUBE_CURATED_DYNAMIC_MAX_VIDEOS = 10000
const VALID_PLAYLIST_ID = /^(?:PL|UU|OLAK5uy_)[A-Za-z0-9_-]{10,120}$/
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
  playlists, sources = null, youtubeApi, at = () => new Date().toISOString(),
} = {}) {
  if (typeof youtubeApi !== 'function') throw new Error('READ_ONLY_YOUTUBE_CALLBACK_REQUIRED')
  const chosen = sources == null ? validateTwoCuratedPlaylists(playlists) : validateConfiguredPlaylists(sources)
  const dynamic = sources != null
  const observedAt = new Date(at()).toISOString()
  const calls = { playlists: 0, playlistItems: 0, videos: 0, search: 0, tmdb: 0 }
  const get = async (endpoint, params) => {
    if (!Object.hasOwn(calls, endpoint) || ['search', 'tmdb'].includes(endpoint)) {
      throw new Error('CURATED_ENDPOINT_NOT_ALLOWED')
    }
    const max = endpoint === 'playlists' ? Math.ceil(chosen.length / 50)
      : endpoint === 'playlistItems' ? (dynamic ? chosen.length * YOUTUBE_CURATED_DYNAMIC_MAX_PAGES_PER_LIST : 10)
      : (dynamic ? 200 : 10)
    if (++calls[endpoint] > max) throw new Error('CURATED_CALL_BUDGET_EXCEEDED')
    return youtubeApi(endpoint, params)
  }
  const byId = new Map()
  for (let i=0; i<chosen.length; i+=50) {
    const meta = await get('playlists', {
      part: 'snippet,status', id: chosen.slice(i,i+50).map(x => x.playlistId).join(','),
    })
    for (const item of meta?.items || []) byId.set(item.id, item)
  }
  const ownersByPlaylistId = new Map()
  for (const source of chosen) {
    const playlist = byId.get(source.playlistId)
    const owner = playlist?.snippet?.channelId
    const privacy = playlist?.status?.privacyStatus
    if (!owner || !['public', 'unlisted'].includes(privacy)) {
      throw new Error('PLAYLIST_NOT_ACCESSIBLE_WITH_READ_ONLY_API_KEY')
    }
    // Both sources are chosen by the user, but need not be published by the same channel.
    // Preserve each playlist publisher instead of asserting ownership/offer rights.
    ownersByPlaylistId.set(source.playlistId, {
      channelId: owner, channelTitle: safe(playlist?.snippet?.channelTitle),
    })
  }
  const ownerIds = [...new Set([...ownersByPlaylistId.values()].map(x => x.channelId))]
  const rows = new Map()
  const perPlaylist = []
  for (const source of chosen) {
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
        if (rows.size > (dynamic ? YOUTUBE_CURATED_DYNAMIC_MAX_VIDEOS : YOUTUBE_CURATED_MAX_VIDEOS)) {
          throw new Error('CURATED_VIDEO_BUDGET_EXCEEDED')
        }
        const row = rows.get(videoId)
        if (!row.playlistModes.includes(source.mode)) row.playlistModes.push(source.mode)
        if (!row.playlistIds.includes(source.playlistId)) row.playlistIds.push(source.playlistId)
        const position = Number.isInteger(item?.snippet?.position) ? item.snippet.position : null
        row.playlistPositions[source.playlistId] = position
        // Preserve historical API shape for the two fixed-list fixture.
        if (!dynamic) row.playlistPositions[source.mode] = position
      }
      token = typeof answer?.nextPageToken === 'string' && answer.nextPageToken
        ? answer.nextPageToken : null
    } while (token && pages < (dynamic ? YOUTUBE_CURATED_DYNAMIC_MAX_PAGES_PER_LIST : YOUTUBE_CURATED_MAX_PAGES_PER_LIST))
    perPlaylist.push({
      mode: source.mode, playlistId: source.playlistId, pages,
      ownerChannelId: ownersByPlaylistId.get(source.playlistId).channelId,
      ownerChannelTitle: ownersByPlaylistId.get(source.playlistId).channelTitle,
      distinctVideoIds: foundIds.size, fullyScanned: token === null,
    })
  }
  if (rows.size > (dynamic ? YOUTUBE_CURATED_DYNAMIC_MAX_VIDEOS : YOUTUBE_CURATED_MAX_VIDEOS)) {
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
    // A video may appear in both playlists; FREE wins, and both source IDs remain.
    const preferredMode = dynamic ? preferredConfiguredPlaylistMode(row.playlistModes)
      : preferredCuratedPlaylistMode(row.playlistModes)
    const disposition = !video ? 'review-video-missing-or-private'
      : !video.screening.eligible ? 'review-screening-rejected'
      : 'review-tmdb-work-identity'
    return {
      ...row, videoTitle: video ? safe(video.title) : null,
      channelId: video?.channelId || null,
      channelTitle: video?.channelTitle || null,
      minutes: video?.minutes ?? null,
      deRegionSignal: video?.deRegionSignal || 'unknown',
      editorialOfferHint: preferredMode,
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
    mode: dynamic ? 'CURATED_DYNAMIC_PLAYLISTS_READ_ONLY' : 'CURATED_TWO_PLAYLISTS_READ_ONLY',
    observedAt, playlistOwnerChannelIds: ownerIds,
    playlistsHaveSameOwner: ownerIds.length === 1,
    playlistSummaries: perPlaylist, uniqueVideoIds: ids.length,
    // Legacy report field counts physical overlaps, now resolved by FREE precedence.
    crossPlaylistConflicts: candidates.filter(x => x.playlistModes.length !== 1).length,
    fullyScanned: perPlaylist.every(x => x.fullyScanned),
    counts: totals, calls,
    independentlyVerifiedWorks: 0, verifiedDEOffers: 0,
    publicationPermitted: false, catalogWrites: 0,
    firestoreWrites: 0, providerWrites: 0, badgeWrites: 0, nightlyWrites: 0,
    candidates,
  }
}
