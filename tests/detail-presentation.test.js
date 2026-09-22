import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DetailLoadingScreen from '../src/components/DetailLoadingScreen.jsx'
import {
  prepareDetailRequestItem,
  preloadDetailImage,
  waitForDetailLoadingPaint,
} from '../src/components/detailPresentation.js'

describe('stabiler Detail-Ladezustand', () => {
  it('lädt einen Search-only-Titel streng vollständig, bevor er präsentiert wird', async () => {
    const complete = { id: 'tmdb-movie-14161', title: '2012', metadataComplete: true }
    const loadComplete = vi.fn(async () => complete)
    const presentArtwork = vi.fn((item) => ({ ...item, displayPosterUrl: '/poster.jpg' }))

    const result = await prepareDetailRequestItem({ id: 'tmdb-movie-14161', title: '2012' }, {
      requireComplete: true,
      artworkOptions: { profileId: 'main' },
      loadComplete,
      presentArtwork,
    })

    expect(loadComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tmdb-movie-14161' }),
      { requireContract: true, requireComplete: true },
    )
    expect(presentArtwork).toHaveBeenCalledWith(complete, { profileId: 'main' })
    expect(result).toMatchObject({ metadataComplete: true, displayPosterUrl: '/poster.jpg' })
  })

  it('startet für einen normalen Titel keinen zweiten strengen Metadatenabruf', async () => {
    const item = { id: 'tmdb-movie-345887', title: 'The Equalizer 2' }
    const loadComplete = vi.fn()
    const presentArtwork = vi.fn((value) => value)

    await expect(prepareDetailRequestItem(item, { loadComplete, presentArtwork })).resolves.toBe(item)
    expect(loadComplete).not.toHaveBeenCalled()
  })

  it('zeigt einen Search-only-Fehler mit Wiederholen innerhalb des Detaildialogs', () => {
    const markup = renderToStaticMarkup(createElement(DetailLoadingScreen, {
      item: { title: '2012', type: 'movie' },
      error: new Error('offline'),
      onRetry: vi.fn(),
      onClose: vi.fn(),
    }))

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('Details nicht erreichbar')
    expect(markup).toContain('Erneut versuchen')
    expect(markup).toContain('Zurück zur Suche')
    expect(markup).not.toContain('class="browse-page search-page search-detail-state"')
  })

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
