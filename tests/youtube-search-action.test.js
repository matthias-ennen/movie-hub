import { describe, expect, it, vi } from 'vitest'
import { launchYouTubeTitleSearch } from '../src/providers/youtubeSearchAction.js'

describe('YouTube user search action: clearly separate from playback/availability', () => {
  it('dispatches on-demand search to native provider without any watch confirmation', () => {
    const openProvider = vi.fn()
    const destination = 'https://www.youtube.com/results?search_query=' + encodeURIComponent('Mann beißt Hund')
    expect(launchYouTubeTitleSearch('Mann beißt Hund', {
      nativeBridge: { openProvider },
      openWindow: vi.fn(),
    })).toBe(true)
    expect(openProvider).toHaveBeenCalledOnce()
    expect(openProvider).toHaveBeenCalledWith('youtube','Mann beißt Hund',destination)
  })
  it('falls back through standard external link bridge then browser', () => {
    const openExternalUrl = vi.fn()
    const openWindow = vi.fn()
    expect(launchYouTubeTitleSearch('War Story', {
      nativeBridge: { openExternalUrl }, openWindow,
    })).toBe(true)
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.youtube.com/results?search_query=War%20Story')
    expect(openWindow).not.toHaveBeenCalled()
    expect(launchYouTubeTitleSearch('War Story', {
      nativeBridge: null,openWindow,
    })).toBe(true)
    expect(openWindow).toHaveBeenCalledWith('https://www.youtube.com/results?search_query=War%20Story')
  })
  it('rejects empty queries without calling network, bridge or browser', () => {
    const openProvider = vi.fn(), openWindow = vi.fn()
    expect(launchYouTubeTitleSearch('  ', {nativeBridge:{openProvider},openWindow})).toBe(false)
    expect(openProvider).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })
})
