import { describe, expect, it } from 'vitest'
import {
  FIELD_DECISIONS,
  inspectSourceSchema,
  schemaSnapshotFromReport,
} from '../src/sources/fieldDiscovery.js'
import { WAIPU_FIELD_POLICY } from '../src/sources/policies/waipuFieldPolicy.js'

describe('source field discovery', () => {
  it('flags unknown source fields for review without accepting them automatically', () => {
    const report = inspectSourceSchema([{
      id: 'program-1',
      title: 'Example',
      startTime: '2026-09-26T18:00:00Z',
      stopTime: '2026-09-26T20:00:00Z',
      audioTracks: ['de', 'en'],
    }], {
      sourceId: 'waipu',
      policy: WAIPU_FIELD_POLICY,
    })

    const unknown = report.fields.find((field) => field.path === 'audioTracks')
    expect(unknown).toMatchObject({
      severity: 'REVIEW',
      status: 'new',
      decision: FIELD_DECISIONS.REVIEW,
    })
  })

  it('keeps rejected fields visible as intentional decisions', () => {
    const report = inspectSourceSchema([{ trackingId: 'abc' }], {
      sourceId: 'fixture',
      policy: {
        trackingId: {
          decision: FIELD_DECISIONS.REJECT,
          reason: 'No Movie Hub product value.',
        },
      },
    })
    expect(report.fields[0]).toMatchObject({
      severity: 'INFO',
      status: 'reject',
      reason: 'No Movie Hub product value.',
    })
  })

  it('marks a known field type change as breaking', () => {
    const first = inspectSourceSchema([{ programId: '123' }], {
      sourceId: 'fixture',
      policy: {
        programId: { decision: FIELD_DECISIONS.EXTENSION },
      },
    })
    const second = inspectSourceSchema([{ programId: { id: '123' } }], {
      sourceId: 'fixture',
      policy: {
        programId: { decision: FIELD_DECISIONS.EXTENSION },
      },
      previousSnapshot: schemaSnapshotFromReport(first),
    })

    expect(second.fields.find((field) => field.path === 'programId')).toMatchObject({
      severity: 'BREAKING',
      status: 'type-changed',
    })
  })

  it('marks disappearing accepted fields as breaking', () => {
    const previousSnapshot = {
      sourceId: 'fixture',
      fields: [{ path: 'programId', types: ['string'] }],
    }
    const report = inspectSourceSchema([{ title: 'Example' }], {
      sourceId: 'fixture',
      policy: {
        programId: { decision: FIELD_DECISIONS.EXTENSION },
        title: { decision: FIELD_DECISIONS.CORE },
      },
      previousSnapshot,
    })

    expect(report.fields.find((field) => field.path === 'programId')).toMatchObject({
      severity: 'BREAKING',
      status: 'missing',
    })
  })

  it('keeps approved Waipu restrictions as extensions', () => {
    const report = inspectSourceSchema([{
      recordingRestrictions: { fastForward: false },
      playbackRestrictions: { replay: true },
    }], {
      sourceId: 'waipu',
      policy: WAIPU_FIELD_POLICY,
    })

    expect(report.fields.find((field) => field.path === 'recordingRestrictions')).toMatchObject({
      severity: 'INFO',
      status: 'extension',
      extensionNamespace: 'waipu',
    })
    expect(report.fields.find((field) => field.path === 'playbackRestrictions')).toMatchObject({
      severity: 'INFO',
      status: 'extension',
      extensionNamespace: 'waipu',
    })
  })
})
