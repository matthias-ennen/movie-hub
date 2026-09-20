import { describe, expect, it, vi } from 'vitest'
import { launchMovieHubMedia } from '../src/library/providerMediaLaunch.js'

function actions(overrides = {}) {
  return {
    nativeBridge: {},
    markWatched: vi.fn(),
    openUrl: vi.fn(),
    playInline: vi.fn(),
    reportUnavailable: vi.fn(),
    ...overrides,
  }
}

describe('Movie-Hub-Anbieteraufruf', () => {
  it('marks a personal link as watched before opening it', () => {
    const calls = []
    const deps = actions({
      markWatched: vi.fn(() => calls.push('watched')),
      openUrl: vi.fn(() => calls.push('open')),
    })

    expect(launchMovieHubMedia({ type: 'web', label: 'Link', url: 'https://example.test' }, deps)).toBe(true)
    expect(calls).toEqual(['watched', 'open'])
  })

  it('marks an internal HTTP video as watched before starting the player', () => {
    const calls = []
    const entry = { type: 'video', label: 'Film', url: 'https://example.test/movie.mp4' }
    const deps = actions({
      markWatched: vi.fn(() => calls.push('watched')),
      playInline: vi.fn(() => calls.push('play')),
    })

    expect(launchMovieHubMedia(entry, deps)).toBe(true)
    expect(calls).toEqual(['watched', 'play'])
    expect(deps.playInline).toHaveBeenCalledWith(entry)
  })

  it('marks an SMB video as watched only when the native player can start it', () => {
    const playSmbMedia = vi.fn()
    const supported = actions({ nativeBridge: { playSmbMedia } })
    const entry = { type: 'video', label: 'NAS-Film', url: 'smb://fritz.nas/Share/movie.mkv' }

    expect(launchMovieHubMedia(entry, supported)).toBe(true)
    expect(supported.markWatched).toHaveBeenCalledOnce()
    expect(playSmbMedia).toHaveBeenCalledWith('NAS-Film', entry.url)

    const unsupported = actions()
    expect(launchMovieHubMedia(entry, unsupported)).toBe(false)
    expect(unsupported.markWatched).not.toHaveBeenCalled()
    expect(unsupported.reportUnavailable).toHaveBeenCalledOnce()
  })
})
