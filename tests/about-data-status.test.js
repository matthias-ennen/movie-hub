import { describe, expect, it, vi } from 'vitest'
import { DATA_STATUS_URL, loadDataStatus, normalizeDataStatus } from '../src/about/dataStatus.js'

const payload = {
  kind: 'movie-hub-data-status',
  version: 1,
  generatedAt: '2026-09-15T08:00:00.000Z',
  catalog: { total: 2278, movies: 1260, series: 1018 },
  searchIndex: { total: 20174, movies: 11708, series: 8466 },
  completeSearchDetails: { total: 20167, movies: 11703, series: 8464, pending: 7 },
  seriesSeasons: { available: 23264, requested: 23264, pending: 0 },
}

describe('Datenstatus für Über Movie Hub', () => {
  it('normalizes the public status payload', () => {
    expect(normalizeDataStatus(payload)).toEqual(payload)
  })

  it('loads exactly one small uncached status resource', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    })

    await expect(loadDataStatus({ fetchImpl })).resolves.toEqual(payload)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(DATA_STATUS_URL, { cache: 'no-store' })
  })

  it('rejects missing or rewritten status resources without inventing values', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    await expect(loadDataStatus({ fetchImpl })).rejects.toThrow('404')
  })
})
