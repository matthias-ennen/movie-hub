import { describe, expect, it, vi } from 'vitest'
import {
  CATALOG_RETRY_DELAYS_MS,
  loadCatalogWithRetry,
} from '../src/performance/catalogStartup.js'

describe('robuster Katalogstart', () => {
  it('wiederholt vorübergehende Fehler mit abgestuften Pausen', async () => {
    const loadCatalog = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('noch nicht erreichbar'))
      .mockResolvedValue({ titles: [{ id: 'ready' }] })
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(loadCatalogWithRetry(loadCatalog, { wait })).resolves.toEqual({
      titles: [{ id: 'ready' }],
    })
    expect(loadCatalog).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenNthCalledWith(1, CATALOG_RETRY_DELAYS_MS[0])
    expect(wait).toHaveBeenNthCalledWith(2, CATALOG_RETRY_DELAYS_MS[1])
  })

  it('gibt erst nach allen automatischen Versuchen den letzten Fehler zurück', async () => {
    const failure = new Error('dauerhaft nicht erreichbar')
    const loadCatalog = vi.fn().mockRejectedValue(failure)
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(loadCatalogWithRetry(loadCatalog, {
      retryDelays: [10, 20],
      wait,
    })).rejects.toBe(failure)
    expect(loadCatalog).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('bricht ausstehende Wiederholungen beim Verlassen sauber ab', async () => {
    let cancelled = false
    const loadCatalog = vi.fn().mockRejectedValue(new Error('offline'))
    const wait = vi.fn().mockImplementation(async () => { cancelled = true })

    await expect(loadCatalogWithRetry(loadCatalog, {
      retryDelays: [10],
      shouldCancel: () => cancelled,
      wait,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(loadCatalog).toHaveBeenCalledOnce()
  })
})
