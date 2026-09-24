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
  days: Array.from({ length: 14 }, (_, index) => ({
    key: new Date(Date.parse('2026-09-24T00:00:00Z') + index * 86400000).toISOString().slice(0, 10),
    count: index === 0 ? 15294 : 0,
  })),
  metadata: { required: true, complete: 1595 },
}

describe('öffentliche Daten nach dem Nachtlauf', () => {
  it('akzeptiert die komplette aktuelle 228er-Generation trotz rollierend kleinerer Titel- und Ausstrahlungszahl', () => {
    const result = evaluatePublishedData(dataStatus, waipuIndex, { scheduledAt, now })
    expect(result.status).toBe('fresh')
    expect(result.waipuTitles).toBe(1595)
    expect(result.broadcasts).toBe(15294)
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

  it('fragt beide produktiven Dateien mit Cache-Umgehung ab', async () => {
    const urls = []
    const fetchImpl = async (url, options) => {
      urls.push([url.toString(), options.cache])
      return { ok: true, json: async () => ({}) }
    }
    await fetchPublishedData({ fetchImpl, now })
    expect(urls).toEqual([
      ['https://movie-hub-62459.web.app/data-status.json?watchdog=1790258400000', 'no-store'],
      ['https://movie-hub-62459.web.app/waipu-live/index.json?watchdog=1790258400000', 'no-store'],
    ])
  })
})
