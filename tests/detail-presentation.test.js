import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DetailLoadingScreen from '../src/components/DetailLoadingScreen.jsx'
import { resolveDetailTvAiring } from '../src/tv/detailTvAiring.js'
import {
  detailInitialImageUrl,
  prepareDetailRequestItem,
  preloadDetailImage,
  waitForDetailLoadingPaint,
} from '../src/components/detailPresentation.js'

function resolveAiring(item, now) {
  return resolveDetailTvAiring(item, { now: Date.parse(now) })
}

describe('stabiler Detail-Ladezustand', () => {
  it('lädt jeden Titel streng vollständig, bevor er präsentiert wird', async () => {
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

  it('ergänzt die zentrale Live-Verfügbarkeit unabhängig vom Einstiegspunkt', async () => {
    const nextAiring = {
      stationId: 'tele5',
      stationName: 'TELE 5',
      startTime: '2026-10-04T18:15:00.000Z',
      stopTime: '2026-10-04T20:15:00.000Z',
      providerIds: ['waipu'],
      playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'waipu://tele5/11' }],
    }
    const item = {
      id: 'tv-airing-old-context',
      tmdbId: 11,
      type: 'movie',
      title: 'Testfilm',
      tvAiring: {
        ...nextAiring,
        stationId: 'old-station',
        stationName: 'Alter Sender',
        startTime: '2026-10-03T18:15:00.000Z',
        stopTime: '2026-10-03T20:15:00.000Z',
      },
    }
    const loadComplete = vi.fn(async () => ({ ...item, metadataComplete: true }))
    const presentArtwork = vi.fn((value) => value)

    const result = await prepareDetailRequestItem(item, {
      liveAvailabilityEntries: [{
        key: 'movie:11',
        type: 'movie',
        tmdbId: 11,
        providers: [{
          providerId: 'waipu',
          airings: [nextAiring],
          nextAiring,
          airingCount: 1,
        }],
      }],
      liveAvailabilityNow: Date.parse('2026-10-04T17:00:00.000Z'),
      loadComplete,
      presentArtwork,
    })

    expect(result.liveAvailability.waipu.nextAiring.stationName).toBe('TELE 5')
    expect(result.providerIds).toContain('waipu')
  })

  it('bewahrt den noch gültigen konkret angeklickten TV-Sendetermin auch für Filme', async () => {
    const clicked = {
      stationId: 'tele5', stationName: 'TELE 5',
      startTime: '2026-10-15T17:15:00.000Z',
      stopTime: '2026-10-15T19:15:00.000Z',
      providerIds: ['waipu'],
      playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'waipu://tele5/movie' }],
    }
    const item = { id: 'tv-runtime-movie-11', type: 'movie', tmdbId: 11, title: 'Filmtitel', tvAiring: clicked }
    const complete = { tmdbId: 11, type: 'movie', title: 'Filmtitel', metadataComplete: true }
    const live = { ...clicked, stationId: 'pro7', stationName: 'ProSieben',
      providerIds: ['joyn'], startTime: '2026-10-15T18:15:00.000Z', stopTime: '2026-10-15T20:15:00.000Z' }
    const result = await prepareDetailRequestItem(item, {
      liveAvailabilityNow: Date.parse('2026-10-15T18:00:00.000Z'),
      liveAvailabilityEntries: [{ key: 'movie:11', providers: [
        { providerId: 'joyn', airings: [live], nextAiring: live },
      ] }],
      loadComplete: async () => complete,
      presentArtwork: (value) => value,
    })
    expect(result.detailAiring).toMatchObject({ stationId: 'tele5', providerIds: ['waipu'] })
    expect(result.liveAvailability.joyn).toBeTruthy()
    expect(resolveAiring(result, '2026-10-15T18:00:00.000Z').stationName).toBe('TELE 5')
  })

  it('bewahrt den Serien-Klick-Kontext trotz anderer Folgen/Sender aus dem Live-Index', async () => {
    const clicked = {
      stationId: 'pro7', stationName: 'ProSieben',
      startTime: '2026-10-15T18:15:00.000Z',
      stopTime: '2026-10-15T19:15:00.000Z',
      providerIds: ['waipu'],
      episode: { seasonNumber: 4, episodeNumber: 3 },
    }
    const joyn = { ...clicked, stationId: 'pro7maxx', stationName: 'ProSieben MAXX',
      providerIds: ['joyn'], episode: { seasonNumber: 4, episodeNumber: 4 } }
    const item = { id: 'tv-runtime-series-71728', type: 'series', tmdbId: 71728, title: 'Young Sheldon', tvAiring: clicked }
    const result = await prepareDetailRequestItem(item, {
      liveAvailabilityNow: Date.parse('2026-10-15T18:20:00.000Z'),
      liveAvailabilityEntries: [{ key: 'series:71728', providers: [
        { providerId: 'joyn', airings: [joyn], nextAiring: joyn },
      ] }],
      loadComplete: async () => ({ type: 'series', tmdbId: 71728, title: 'Young Sheldon', metadataComplete: true }),
      loadAvailability: async () => [],
      presentArtwork: (value) => value,
    })
    expect(result.detailAiring).toMatchObject({ stationId: 'pro7', providerIds: ['waipu'] })
    expect(resolveAiring(result, '2026-10-15T18:20:00.000Z').providerIds).toEqual(['waipu'])
  })

  it('verwirft abgelaufene oder deaktivierte Klick-Kontexte', async () => {
    const item = { type: 'movie', tmdbId: 7, title: 'Film',
      tvAiring: { stationId: 'old', startTime: '2026-10-14T18:00:00.000Z',
        stopTime: '2026-10-14T19:00:00.000Z', providerIds: ['waipu'] } }
    const result = await prepareDetailRequestItem(item, {
      liveAvailabilityNow: Date.parse('2026-10-15T18:00:00.000Z'),
      loadComplete: async () => ({ type: 'movie', tmdbId: 7, title: 'Film' }),
      presentArtwork: (value) => value,
    })
    expect(result.detailAiring).toBeUndefined()
  })

  it('verwendet auch für normale Titel denselben vollständigen Metadatenvertrag', async () => {
    const item = { id: 'tmdb-movie-345887', tmdbId: 345887, type: 'movie', title: 'The Equalizer 2' }
    const complete = {
      ...item,
      metadataVersion: 3,
      metadataComplete: true,
      collectionChecked: true,
    }
    const loadComplete = vi.fn(async () => complete)
    const presentArtwork = vi.fn((value) => value)

    await expect(prepareDetailRequestItem(item, { loadComplete, presentArtwork })).resolves.toBe(complete)
    expect(loadComplete).toHaveBeenCalledWith(item, {
      requireContract: true,
      requireComplete: true,
    })
  })

  it('preloads for a series the poster that is actually visible first', () => {
    const series = {
      id: 'tmdb-series-1',
      tmdbId: 1,
      type: 'series',
      displayPosterUrl: '/series.jpg',
      seasons: [
        { seasonNumber: 2, posterUrl: '/season-2.jpg' },
        { seasonNumber: 1, posterUrl: '/season-1.jpg' },
      ],
    }

    expect(detailInitialImageUrl(series)).toBe('/series.jpg')
    expect(detailInitialImageUrl({ ...series, tvAiring: { seasonNumber: 2, episodeNumber: 4 } })).toBe('/season-2.jpg')
    expect(detailInitialImageUrl({
      id: 'tmdb-movie-2',
      type: 'movie',
      displayPosterUrl: '/movie.jpg',
    })).toBe('/movie.jpg')
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
    expect(markup).toContain('Zurück')
    expect(markup).not.toContain('Zurück zur Suche')
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

  it('bricht nur den privaten Detailbild-Preload beim Session-Abbruch sauber ab', async () => {
    const controller = new AbortController()
    const removeAttribute = vi.fn()
    const image = {
      complete: false,
      removeAttribute,
    }
    const clearTask = vi.fn()
    const promise = preloadDetailImage('https://example.test/poster.jpg', {
      createImage: () => image,
      scheduleTask: vi.fn(() => 31),
      clearTask,
      signal: controller.signal,
    })

    controller.abort()

    await expect(promise).resolves.toBe('aborted')
    expect(removeAttribute).toHaveBeenCalledWith('src')
    expect(clearTask).toHaveBeenCalledWith(31)
    expect(image.onload).toBeNull()
    expect(image.onerror).toBeNull()
  })

  it('startet bei bereits abgebrochener Session gar keinen Bildrequest', async () => {
    const controller = new AbortController()
    controller.abort()
    const createImage = vi.fn()

    await expect(preloadDetailImage('https://example.test/poster.jpg', {
      createImage,
      signal: controller.signal,
    })).resolves.toBe('aborted')
    expect(createImage).not.toHaveBeenCalled()
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
