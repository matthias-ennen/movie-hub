import { resolvePresentationArtwork } from '../catalog/artworkRotation.js'
import { loadRuntimeTitleMetadata } from '../catalog/runtimeTitleMetadata.js'

const DETAIL_IMAGE_WAIT_MS = 1_500

export async function prepareDetailRequestItem(item, {
  requireComplete = false,
  artworkOptions = {},
  loadComplete = loadRuntimeTitleMetadata,
  presentArtwork = resolvePresentationArtwork,
} = {}) {
  const detail = requireComplete
    ? await loadComplete(item, {
        requireContract: true,
        requireComplete: true,
      })
    : item
  return presentArtwork(detail, artworkOptions)
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
} = {}) {
  if (!url || typeof createImage !== 'function') return Promise.resolve('no-image')

  return new Promise((resolve) => {
    let settled = false
    let timeout = null
    const image = createImage()

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timeout !== null && typeof clearTask === 'function') clearTask(timeout)
      image.onload = null
      image.onerror = null
      resolve(result)
    }

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
