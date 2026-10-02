import { beforeEach, describe, expect, it } from 'vitest'
import {
  cancelPerformanceSpan,
  clearPerformanceDiagnostics,
  finishPerformanceSpan,
  getPerformanceDiagnosticsSnapshot,
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
})
