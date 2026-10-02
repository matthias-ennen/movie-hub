import { describe, expect, it, vi } from 'vitest'
import { preloadSecondaryView } from '../src/performance/viewModulePreload.js'

describe('secondary view module preload', () => {
  it('does nothing for a view without a lazy module', () => {
    const load = vi.fn()

    expect(preloadSecondaryView('home', {
      loaders: { settings: load },
    })).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('starts the matching lazy module exactly once per intent call', async () => {
    const load = vi.fn(async () => ({ default: () => null }))

    await expect(preloadSecondaryView('settings', {
      loaders: { settings: load },
    })).resolves.toBeTruthy()
    expect(load).toHaveBeenCalledOnce()
  })

  it('keeps navigation usable when speculative preload fails', async () => {
    const load = vi.fn(async () => {
      throw new Error('network')
    })

    await expect(preloadSecondaryView('search', {
      loaders: { search: load },
    })).resolves.toBeNull()
  })
})
