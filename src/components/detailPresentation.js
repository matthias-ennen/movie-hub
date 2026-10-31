import { imageAdmission } from '../performance/imageAdmission.js'
import { resolvePresentationArtwork } from '../catalog/artworkRotation.js'
import { loadRuntimeTitleMetadata } from '../catalog/runtimeTitleMetadata.js'
import { normalizeSeriesSeasons } from '../catalog/seriesNavigation.js'
import { loadSeriesAvailability } from '../catalog/seriesAvailability.js'
import { mergeLiveAvailability } from '../sources/liveAvailabilityIndex.js'
import { episodeReference, openingEpisode } from '../catalog/episodeContext.js'
import { navigationEpisode } from '../catalog/episodeResolution.js'
import { resolveDetailTvAiring } from '../tv/detailTvAiring.js'

const DETAIL_IMAGE_WAIT_MS = 1_500

export async function prepareDetailRequestItem(item, {
  artworkOptions = {},
  signal,
  liveAvailabilityEntries = [],
  liveAvailabilityNow = Date.now(),
  acceptLiveProvider = null,
  loadComplete = loadRuntimeTitleMetadata,
  loadAvailability = loadSeriesAvailability,
  presentArtwork = resolvePresentationArtwork,
} = {}) {
  const isSeries = item?.type === 'series' || item?.mediaType === 'tv'
  const [detail, availableSeasons] = await Promise.all([loadComplete(item, {
    requireContract: true,
    requireComplete: true,
    ...(signal ? { signal } : {}),
  }), isSeries ? loadAvailability(item.tmdbId) : null])
  const [liveDetail = detail] = mergeLiveAvailability(
    [detail],
    liveAvailabilityEntries,
    { now: liveAvailabilityNow, acceptLiveProvider },
  )
  // The clicked card identifies one concrete programme, not every broadcast
  // of the same TMDB title. This anchor survives async TMDB enrichment and
  // also applies to movies, not only series. Expired/disabled airings are
  // discarded so a normal catalogue detail still picks the next valid airing.
  const clickedAiring = item?.tvAiring
  const start = Date.parse(clickedAiring?.startTime)
  const stop = Date.parse(clickedAiring?.stopTime)
  const providerIds = (Array.isArray(clickedAiring?.providerIds)
    ? clickedAiring.providerIds : [clickedAiring?.source].filter(Boolean))
    .filter((id) => !acceptLiveProvider || acceptLiveProvider(id, clickedAiring))
  const hasValidClick = Number.isFinite(start) && Number.isFinite(stop)
    && start < stop && stop > liveAvailabilityNow
    && item?.detailEpisode !== null
    && (!acceptLiveProvider || providerIds.length > 0)
  const detailAiring = hasValidClick
    ? {
        ...clickedAiring,
        providerIds,
        playbackRoutes: (Array.isArray(clickedAiring?.playbackRoutes) ? clickedAiring.playbackRoutes : [])
          .filter((route) => providerIds.includes(route?.providerId)),
      } : null
  const anchoredDetail = detailAiring ? { ...liveDetail, detailAiring } : liveDetail
  if (!isSeries) return presentArtwork(anchoredDetail, artworkOptions)
  const prepared = {
    ...anchoredDetail, availableSeasons, detailAiring,
    detailEpisode: null, detailSelection: item.detailEpisode || undefined,
  }
  const airing = resolveDetailTvAiring(prepared, { now: liveAvailabilityNow })
  const detailEpisode = item.detailEpisode || navigationEpisode(episodeReference(airing))
    || (airing ? null : openingEpisode(item))
  return presentArtwork({ ...prepared, detailEpisode }, artworkOptions)
}

export function detailInitialImageUrl(item) {
  if (!item) return null
  if (item.type === 'series' || item.mediaType === 'tv') {
    const seasons = normalizeSeriesSeasons(item.seasons, {
      seriesTmdbId: item.tmdbId,
      numberOfSeasons: item.numberOfSeasons,
    })
    const selected = seasons.find((season) => season.seasonNumber === openingEpisode(item)?.seasonNumber)
    if (selected?.posterUrl) return selected.posterUrl
  }
  return item.displayPosterUrl || item.posterUrl || null
}

export function waitForDetailLoadingPaint({
  requestFrame = globalThis.requestAnimationFrame,
  scheduleTask = globalThis.setTimeout,
} = {}) {
  if (typeof requestFrame !== 'function' || typeof scheduleTask !== 'function') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    requestFrame(() => scheduleTask(resolve, 0))
  })
}

export function preloadDetailImage(url, {
  createImage = () => new Image(),
  scheduleTask = globalThis.setTimeout,
  clearTask = globalThis.clearTimeout,
  timeoutMs = DETAIL_IMAGE_WAIT_MS,
  signal = null,
} = {}) {
  if (!url || typeof createImage !== 'function') return Promise.resolve('no-image')
  if (signal?.aborted) return Promise.resolve('aborted')

  return new Promise((resolve) => {
    let settled = false
    let timeout = null
    let image = null
    let cancelRequest = () => {}
    let releaseSlot = () => {}

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timeout !== null && typeof clearTask === 'function') clearTask(timeout)
      signal?.removeEventListener?.('abort', handleAbort)
      if (image) { image.onload = null; image.onerror = null }
      cancelRequest()
      releaseSlot()
      resolve(result)
    }

    const handleAbort = () => {
      try {
        image?.removeAttribute?.('src')
      } catch {
        // Best effort only. The session result is still discarded safely.
      }
      finish('aborted')
    }

    signal?.addEventListener?.('abort', handleAbort, { once: true })

    if (typeof scheduleTask === 'function') {
      timeout = scheduleTask(() => finish('timeout'), timeoutMs)
    }
    cancelRequest = imageAdmission.request({
      priority: 4,
      cancel: () => { image?.removeAttribute?.('src') },
      start: (release) => {
        releaseSlot = release
        image = createImage()
        image.onload = async () => {
          if (typeof image.decode === 'function') {
            try {
              await image.decode()
            } catch {
              // Older Fire-TV WebViews may not support decode reliably.
            }
          }
          finish('loaded')
        }
        image.onerror = () => finish('error')
        image.src = url
        if (image.complete) image.onload()
      },
    })
  })
}
