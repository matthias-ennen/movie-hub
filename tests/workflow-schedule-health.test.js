import { describe, expect, it } from 'vitest'
import {
  captureWorkflowTiming,
  evaluateScheduledRuns,
  expectedScheduleAt,
} from '../scripts/check-data-workflow-schedule.mjs'

describe('Nachtlauf-Zeitplanung', () => {
  it('plant 03:17 Europe/Berlin korrekt durch Sommer- und Winterzeit', () => {
    expect(expectedScheduleAt(new Date('2026-09-21T04:00:00.000Z')).toISOString()).toBe('2026-09-21T01:17:00.000Z')
    expect(expectedScheduleAt(new Date('2026-12-21T05:00:00.000Z')).toISOString()).toBe('2026-12-21T02:17:00.000Z')
  })

  it('meldet einen planmäßigen Start nach mehr als 60 Minuten als verspätet', () => {
    const result = captureWorkflowTiming({
      now: new Date('2026-09-21T02:30:00.000Z'),
      eventName: 'schedule',
    })
    expect(result.status).toBe('delayed')
    expect(result.delayMinutes).toBe(73)
  })

  it('erkennt einen ausgebliebenen Lauf unabhängig vom Datenworkflow', () => {
    const result = evaluateScheduledRuns([], { now: new Date('2026-09-21T04:00:00.000Z') })
    expect(result.status).toBe('missing')
    expect(result.scheduledAt).toBe('2026-09-21T01:17:00.000Z')
  })

  it('akzeptiert den richtigen heutigen Deploy-Firebase-Lauf', () => {
    const result = evaluateScheduledRuns([
      {
        id: 42,
        run_number: 354,
        name: 'Deploy Firebase',
        event: 'schedule',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-09-21T01:29:00.000Z',
        html_url: 'https://github.com/example/repo/actions/runs/42',
      },
    ], { now: new Date('2026-09-21T04:00:00.000Z') })
    expect(result.status).toBe('healthy')
    expect(result.delayMinutes).toBe(12)
    expect(result.run.number).toBe(354)
  })
})
