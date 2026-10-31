import { beforeEach, describe, expect, it } from 'vitest'
import {
  cancelPerformanceSpan,
  clearPerformanceDiagnostics,
  finishPerformanceSpan,
  getPerformanceDiagnosticsSnapshot,
  installPerformanceDiagnostics,
  measurePerformance,
  recordPerformanceEvent,
  startPerformanceSpan,
} from '../src/performance/performanceDiagnostics.js'

describe('performance diagnostics', () => {
  beforeEach(() => clearPerformanceDiagnostics())

  it('records only bounded primitive diagnostic detail', () => {
    recordPerformanceEvent('hero:ready', {
      pageId: 'tv',
      durationMs: 123.456,
      nested: { title: 'must not leak' },
    })

    const snapshot = getPerformanceDiagnosticsSnapshot()
    expect(snapshot.events).toHaveLength(1)
    expect(snapshot.events[0].name).toBe('hero:ready')
    expect(snapshot.events[0].detail.pageId).toBe('tv')
    expect(snapshot.events[0].detail.durationMs).toBe(123.456)
    expect(snapshot.events[0].detail.nested).toBeNull()
  })

  it('finishes and removes a named span', () => {
    expect(startPerformanceSpan('tv:day', 'request-1', { dayKey: '2026-10-02' })).toBe(true)
    const completed = finishPerformanceSpan('tv:day', 'request-1', { entries: 25 })

    expect(completed.name).toBe('tv:day:ready')
    expect(completed.detail.dayKey).toBe('2026-10-02')
    expect(completed.detail.entries).toBe(25)
    expect(completed.detail.durationMs).toBeGreaterThanOrEqual(0)
    expect(getPerformanceDiagnosticsSnapshot().activeSpanCount).toBe(0)
  })

  it('records cancellation without leaving stale spans', () => {
    startPerformanceSpan('detail', '7', { requireComplete: true })
    const cancelled = cancelPerformanceSpan('detail', '7', { reason: 'closed' })

    expect(cancelled.name).toBe('detail:cancel')
    expect(cancelled.detail.requireComplete).toBe(true)
    expect(cancelled.detail.reason).toBe('closed')
    expect(getPerformanceDiagnosticsSnapshot().activeSpanCount).toBe(0)
  })

  it('measures real synchronous work, preserves its result and rethrows failures', () => {
    const result = { rows: [] }
    expect(measurePerformance('tv:rows-model', () => result, { airingCount: 3 })).toBe(result)
    const failure = new Error('model failed')
    expect(() => measurePerformance('tv:rows-model', () => { throw failure })).toThrow(failure)
    expect(getPerformanceDiagnosticsSnapshot().events.map((event) => event.name))
      .toEqual(['tv:rows-model:ready', 'tv:rows-model:error'])
  })

  it('keeps both diagnostic events and browser marks bounded during repeated updates', () => {
    for (let index = 0; index < 250; index += 1) recordPerformanceEvent('tv:time-transition')
    expect(getPerformanceDiagnosticsSnapshot().events).toHaveLength(200)
    expect(performance.getEntriesByName('moviehub:tv:time-transition')).toHaveLength(1)
  })

  it('retains the bounded startup evidence after the runtime event ring rotates', () => {
    recordPerformanceEvent('startup:interactive', { activityToVisibleMs: 6400 })
    for (let index = 0; index < 300; index++) recordPerformanceEvent('tv:time-transition')
    expect(getPerformanceDiagnosticsSnapshot().events).toHaveLength(200)
    expect(getPerformanceDiagnosticsSnapshot().startup.events).toEqual([
      expect.objectContaining({ name: 'startup:interactive', detail: { activityToVisibleMs: 6400 } }),
    ])
    clearPerformanceDiagnostics()
    expect(getPerformanceDiagnosticsSnapshot().startup.events).toEqual([])
  })

  it('tolerates old WebViews and records only numeric long-task evidence on supported engines', () => {
    expect(installPerformanceDiagnostics({}).longTasksSupported).toBe(false)
    let callback
    let observes = 0
    class Observer {
      static supportedEntryTypes = ['longtask']
      constructor(handler) { callback = handler }
      observe() { observes += 1 }
    }
    const target = { PerformanceObserver: Observer }
    const api = installPerformanceDiagnostics(target)
    expect(installPerformanceDiagnostics(target)).toBe(api)
    expect(observes).toBe(1)
    callback({ getEntries: () => [{ startTime: 42, duration: 85, attribution: [{ private: true }] }] })
    expect(getPerformanceDiagnosticsSnapshot().events[0]).toMatchObject({
      name: 'main-thread:long-task', detail: { startTimeMs: 42, durationMs: 85 },
    })
    expect(getPerformanceDiagnosticsSnapshot().events[0].detail).not.toHaveProperty('attribution')
  })
})
