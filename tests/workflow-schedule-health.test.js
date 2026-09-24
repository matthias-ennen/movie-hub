import { describe, expect, it } from 'vitest'
import {
  captureWorkflowTiming,
  evaluateScheduleGate,
  evaluateScheduledRuns,
  expectedScheduleAt,
  scheduledAtForLocalDate,
} from '../scripts/check-data-workflow-schedule.mjs'

describe('Nachtlauf-Zeitplanung', () => {
  it('plant 03:17 Europe/Berlin korrekt durch Sommer- und Winterzeit', () => {
    expect(expectedScheduleAt(new Date('2026-09-21T04:00:00.000Z')).toISOString()).toBe('2026-09-21T01:17:00.000Z')
    expect(expectedScheduleAt(new Date('2026-12-21T05:00:00.000Z')).toISOString()).toBe('2026-12-21T02:17:00.000Z')
  })

  it('berechnet das heutige lokale Zeitfenster auch vor 03:17 Uhr', () => {
    expect(scheduledAtForLocalDate(new Date('2026-12-21T01:17:00.000Z')).toISOString()).toBe('2026-12-21T02:17:00.000Z')
  })

  it('überspringt den verfrühten UTC-Sommerzeit-Ersatztrigger im Winter', () => {
    const result = evaluateScheduleGate([], {
      now: new Date('2026-12-21T01:17:00.000Z'),
      currentRunId: 101,
      eventName: 'schedule',
    })
    expect(result.shouldRun).toBe(false)
    expect(result.reason).toBe('before-daily-window')
  })

  it('startet den ersten fälligen Nachtlauf nach 03:17 Uhr', () => {
    const result = evaluateScheduleGate([], {
      now: new Date('2026-09-21T01:18:00.000Z'),
      currentRunId: 102,
      eventName: 'schedule',
    })
    expect(result.shouldRun).toBe(true)
    expect(result.reason).toBe('daily-run-due')
  })

  it('überspringt einen Ersatztrigger nach einem bereits gestarteten Tageslauf', () => {
    const result = evaluateScheduleGate([
      {
        id: 201,
        run_number: 390,
        name: 'Deploy Firebase',
        event: 'schedule',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-09-21T01:24:00.000Z',
        html_url: 'https://github.com/example/repo/actions/runs/201',
      },
    ], {
      now: new Date('2026-09-21T02:17:00.000Z'),
      currentRunId: 202,
      eventName: 'schedule',
    })
    expect(result.shouldRun).toBe(false)
    expect(result.reason).toBe('daily-run-already-started')
    expect(result.run.number).toBe(390)
  })

  it('startet den Ersatztrigger erneut, wenn der frühere Tageslauf fehlgeschlagen ist', () => {
    const result = evaluateScheduleGate([
      {
        id: 301,
        run_number: 391,
        name: 'Deploy Firebase',
        event: 'schedule',
        status: 'completed',
        conclusion: 'failure',
        created_at: '2026-09-21T01:24:00.000Z',
      },
    ], {
      now: new Date('2026-09-21T02:17:00.000Z'),
      currentRunId: 302,
      eventName: 'schedule',
    })
    expect(result.shouldRun).toBe(true)
    expect(result.reason).toBe('daily-run-due')
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
    ], {
      now: new Date('2026-09-21T04:00:00.000Z'),
      jobsByRunId: { 42: [{ name: 'deploy', status: 'completed', conclusion: 'success', started_at: '2026-09-21T01:30:00.000Z' }] },
    })
    expect(result.status).toBe('healthy')
    expect(result.delayMinutes).toBe(12)
    expect(result.run.number).toBe(354)
  })

  it('ordnet den verspäteten 24.09.-Deploy dem echten Lauf zu und benennt den Gate-only-Ersatz', () => {
    const result = evaluateScheduledRuns([
      { id: 1, run_number: 550, name: 'Deploy Firebase', event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-09-24T06:10:42Z', html_url: 'https://github.com/example/runs/1' },
      { id: 2, run_number: 551, name: 'Deploy Firebase', event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-09-24T07:37:56Z', html_url: 'https://github.com/example/runs/2' },
    ], {
      now: new Date('2026-09-24T09:32:21Z'),
      jobsByRunId: {
        1: [{ name: 'deploy', status: 'completed', conclusion: 'success', started_at: '2026-09-24T06:11:13Z', completed_at: '2026-09-24T06:55:20Z' }],
        2: [{ name: 'deploy', status: 'completed', conclusion: 'skipped' }],
      },
    })
    expect(result.status).toBe('delayed')
    expect(result.delayMinutes).toBe(293)
    expect(result.run.number).toBe(550)
    expect(result.deployStartAt).toBe('2026-09-24T06:11:13Z')
    expect(result.gateOnlyRuns).toEqual([{ number: 551, url: 'https://github.com/example/runs/2' }])
  })

  it('hält einen ausschließlich übersprungenen Ersatztrigger nicht für einen Datenlauf', () => {
    const result = evaluateScheduledRuns([
      { id: 2, run_number: 551, name: 'Deploy Firebase', event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-09-24T07:37:56Z', html_url: 'https://github.com/example/runs/2' },
    ], {
      now: new Date('2026-09-24T09:32:21Z'),
      jobsByRunId: { 2: [{ name: 'deploy', status: 'completed', conclusion: 'skipped' }] },
    })
    expect(result.status).toBe('missing')
    expect(result.gateOnlyRuns).toHaveLength(1)
  })
})
