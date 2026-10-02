import { resolvePresentationArtwork } from '../catalog/artworkRotation.js'
import { loadRuntimeTitleMetadata } from '../catalog/runtimeTitleMetadata.js'
import { normalizeSeriesSeasons } from '../catalog/seriesNavigation.js'

const DETAIL_IMAGE_WAIT_MS = 1_500

export async function prepareDetailRequestItem(item, {
  artworkOptions = {},
  loadComplete = loadRuntimeTitleMetadata,
  presentArtwork = resolvePresentationArtwork,
} = {}) {
  const detail = await loadComplete(item, {
    requireContract: true,
    requireComplete: true,
  })
  return presentArtwork(detail, artworkOptions)
}

export function detailInitialImageUrl(item) {
  if (!item) return null
  if (item.type === 'series' || item.mediaType === 'tv') {
    const seasons = normalizeSeriesSeasons(item.seasons, {
      seriesTmdbId: item.tmdbId,
      numberOfSeasons: item.numberOfSeasons,
    })
    if (seasons[0]?.posterUrl) return seasons[0].posterUrl
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
    const image = createImage()

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timeout !== null && typeof clearTask === 'function') clearTask(timeout)
      signal?.removeEventListener?.('abort', handleAbort)
      image.onload = null
      image.onerror = null
      resolve(result)
    }

    const handleAbort = () => {
      try {
        image.removeAttribute?.('src')
      } catch {
        // Best effort only. The session result is still discarded safely.
      }
      finish('aborted')
    }

    signal?.addEventListener?.('abort', handleAbort, { once: true })

    image.onload = async () => {
      if (typeof image.decode === 'function') {
        try {
          await image.decode()
        } catch {
          // Das geladene Bild darf auch erscheinen, wenn decode() auf einer
          // älteren Fire-TV-WebView nicht zuverlässig unterstützt wird.
        }
      }
      finish('loaded')
    }
    image.onerror = () => finish('error')
    if (typeof scheduleTask === 'function') {
      timeout = scheduleTask(() => finish('timeout'), timeoutMs)
    }
    image.src = url
    if (image.complete) image.onload()
  })
}
