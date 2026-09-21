import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSharedMediaLoadCache,
  loadSharedMediaCached,
} from '../src/library/sharedMedia.js'

vi.mock('../src/lib/firebase.js', () => ({
  firebaseReady: new Promise(() => {}),
}))

describe('Sitzungscache für eigene Movie-Hub-Medien', () => {
  beforeEach(() => clearSharedMediaLoadCache())

  it('teilt parallele und wiederholte Lesevorgänge für denselben Titel', async () => {
    const entries = [{ id: 'nas', label: 'NAS' }]
    const load = vi.fn().mockResolvedValue(entries)
    const item = { type: 'movie', tmdbId: 42 }

    const first = loadSharedMediaCached('user-1', item, { load })
    const second = loadSharedMediaCached('user-1', item, { load })

    expect(first).toBe(second)
    await expect(first).resolves.toEqual(entries)
    await expect(loadSharedMediaCached('user-1', item, { load })).resolves.toEqual(entries)
    expect(load).toHaveBeenCalledOnce()
  })

  it('entfernt fehlgeschlagene Lesevorgänge, damit ein neuer Versuch möglich bleibt', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])
    const item = { type: 'series', tmdbId: 7 }

    await expect(loadSharedMediaCached('user-1', item, { load })).rejects.toThrow('offline')
    await expect(loadSharedMediaCached('user-1', item, { load })).resolves.toEqual([])
    expect(load).toHaveBeenCalledTimes(2)
  })
})
