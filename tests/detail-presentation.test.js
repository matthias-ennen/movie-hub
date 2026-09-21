import { describe, expect, it, vi } from 'vitest'
import {
  preloadDetailImage,
  waitForDetailLoadingPaint,
} from '../src/components/detailPresentation.js'

describe('stabiler Detail-Ladezustand', () => {
  it('wartet bis nach dem nächsten Browser-Frame, bevor die Vorbereitung weiterläuft', async () => {
    let frameCallback = null
    let taskCallback = null
    const promise = waitForDetailLoadingPaint({
      requestFrame: (callback) => { frameCallback = callback },
      scheduleTask: (callback) => { taskCallback = callback },
    })
    let settled = false
    promise.then(() => { settled = true })

    await Promise.resolve()
    expect(settled).toBe(false)
    frameCallback()
    expect(settled).toBe(false)
    taskCallback()
    await promise
    expect(settled).toBe(true)
  })

  it('dekodiert das Detailbild vor der vollständigen Anzeige', async () => {
    const image = { complete: false, decode: vi.fn().mockResolvedValue(undefined) }
    const clearTask = vi.fn()
    const promise = preloadDetailImage('https://example.test/poster.jpg', {
      createImage: () => image,
      scheduleTask: vi.fn(() => 17),
      clearTask,
    })

    expect(image.src).toBe('https://example.test/poster.jpg')
    await image.onload()
    await expect(promise).resolves.toBe('loaded')
    expect(image.decode).toHaveBeenCalledOnce()
    expect(clearTask).toHaveBeenCalledWith(17)
  })

  it('blockiert die Detailseite bei einem langsamen Bild nicht unbegrenzt', async () => {
    const image = { complete: false }
    let timeoutCallback = null
    const promise = preloadDetailImage('https://example.test/slow.jpg', {
      createImage: () => image,
      scheduleTask: (callback) => {
        timeoutCallback = callback
        return 23
      },
      clearTask: vi.fn(),
    })

    timeoutCallback()
    await expect(promise).resolves.toBe('timeout')
  })
})
