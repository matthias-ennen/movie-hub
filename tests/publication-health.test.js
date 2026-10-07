import { describe, expect, it } from 'vitest'
import { evaluatePublishedData, fetchPublishedData } from '../scripts/validate-publication-health.mjs'

const scheduledAt = '2026-09-24T01:17:00Z'
const now = new Date('2026-09-24T14:00:00Z')
const dataStatus = {
  kind: 'movie-hub-data-status', version: 2, generatedAt: '2026-09-24T13:56:45Z',
  catalog: { total: 2271, movies: 1262, series: 1009 },
  searchIndex: { total: 20096, movies: 11650, series: 8446 },
  completeSearchDetails: { total: 13353, pending: 6743 },
}
const waipuIndex = {
  kind: 'waipu-live-index', schemaVersion: 1, status: 'complete', generatedAt: '2026-09-24T09:02:00Z',
  horizon: { start: '2026-09-24T00:00:00Z', endExclusive: '2026-10-08T00:00:00Z' },
  counts: { stations: 228, titles: 1595, broadcasts: 15294 },
  days: [
    { key: '2026-09-23', count: 1 },
    ...Array.from({ length: 14 }, (_, index) => ({
      key: new Date(Date.parse('2026-09-24T00:00:00Z') + index * 86400000).toISOString().slice(0, 10),
      count: index === 0 ? 15293 : 0,
    })),
  ],
  metadata: { required: true, complete: 1595 },
}

describe('öffentliche Daten nach dem Nachtlauf', () => {
  it('akzeptiert die komplette aktuelle 228er-Generation mit 06:00-TV-Tagesgrenze', () => {
    const result = evaluatePublishedData(dataStatus, waipuIndex, { scheduledAt, now })
    expect(result.status).toBe('fresh')
    expect(result.waipuTitles).toBe(1595)
    expect(result.broadcasts).toBe(15294)
  })

  it('akzeptiert eine vollständige 14-Tage-Generation ohne leeren Vortags-Descriptor', () => {
    const productionShape = {
      ...waipuIndex,
      counts: { ...waipuIndex.counts, broadcasts: 45790 },
      days: [
        { key: '2026-09-24', count: 2864 },
        { key: '2026-09-25', count: 3264 },
        { key: '2026-09-26', count: 3339 },
        { key: '2026-09-27', count: 3289 },
        { key: '2026-09-28', count: 3396 },
        { key: '2026-09-29', count: 3401 },
        { key: '2026-09-30', count: 3436 },
        { key: '2026-10-01', count: 3243 },
        { key: '2026-10-02', count: 3077 },
        { key: '2026-10-03', count: 3401 },
        { key: '2026-10-04', count: 3421 },
        { key: '2026-10-05', count: 3424 },
        { key: '2026-10-06', count: 3415 },
        { key: '2026-10-07', count: 2820 },
      ],
    }
    const result = evaluatePublishedData(dataStatus, productionShape, { scheduledAt, now })
    expect(result.status).toBe('fresh')
    expect(result.broadcasts).toBe(45790)
  })

  it('weist doppelte oder unsortierte Tagesdeskriptoren weiterhin ab', () => {
    const result = evaluatePublishedData(dataStatus, {
      ...waipuIndex,
      days: [
        ...waipuIndex.days.slice(0, 2),
        { ...waipuIndex.days[1] },
        ...waipuIndex.days.slice(3),
      ],
    }, { scheduledAt, now })
    expect(result.status).toBe('invalid')
    expect(result.reasons).toContain('Waipu-Tagesbestand inkonsistent')
  })

  it('erkennt einen alten Waipu-Import, auch wenn ein späterer Code-Deploy den Datenstatus erneuert', () => {
    const result = evaluatePublishedData(dataStatus, { ...waipuIndex, generatedAt: '2026-09-23T06:21:48Z' }, { scheduledAt, now })
    expect(result.status).toBe('stale')
    expect(result.reasons).toContain('Waipu-Index älter als Tageslauf')
  })

  it('blockiert einen unvollständigen oder inkonsistenten Tagesbestand', () => {
    const result = evaluatePublishedData(dataStatus, {
      ...waipuIndex, status: 'partial', days: waipuIndex.days.slice(0, -1),
    }, { scheduledAt, now })
    expect(result.status).toBe('invalid')
    expect(result.reasons).toContain('Waipu-Index nicht vollständig')
  })

  it('erkennt eine falsche Tagesbucket-Summe weiterhin als inkonsistent', () => {
    const result = evaluatePublishedData(dataStatus, {
      ...waipuIndex,
      days: waipuIndex.days.map((day, index) => index === 1 ? { ...day, count: day.count - 1 } : day),
    }, { scheduledAt, now })
    expect(result.status).toBe('invalid')
    expect(result.reasons).toContain('Waipu-Tagesbestand inkonsistent')
  })

  it('fragt alle fünf produktiven Dateien mit Cache-Umgehung ab', async () => {
    const urls = []
    const fetchImpl = async (url, options) => {
      urls.push([url.toString(), options.cache])
      return { ok: true, json: async () => ({}) }
    }
    await fetchPublishedData({ fetchImpl, now })
    expect(urls).toEqual([
      ['https://movie-hub-62459.web.app/data-status.json?watchdog=1790258400000', 'no-store'],
      ['https://movie-hub-62459.web.app/waipu-live/index.json?watchdog=1790258400000', 'no-store'],
      ['https://movie-hub-62459.web.app/joyn-live/index.json?watchdog=1790258400000', 'no-store'],
      ['https://movie-hub-62459.web.app/live-availability-index.json?watchdog=1790258400000', 'no-store'],
      ['https://movie-hub-62459.web.app/tv-runtime/index.json?watchdog=1790258400000', 'no-store'],
    ])
  })
})
