import { describe, expect, it } from 'vitest'
import { SourceSchemaObserver } from '../src/sources/sourceSchemaObserver.js'
import { FIELD_DECISIONS } from '../src/sources/fieldDiscovery.js'

describe('SourceSchemaObserver', () => {
  it('aggregates field shapes incrementally without retaining raw payloads', () => {
    const observer = new SourceSchemaObserver({
      sourceId: 'fixture',
      policy: {
        id: { decision: FIELD_DECISIONS.CORE },
        title: { decision: FIELD_DECISIONS.CORE },
        extra: { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'fixture' },
      },
    })

    observer.observe({ id: '1', title: 'A', extra: { flag: true } })
    observer.observe({ id: '2', title: 'B', extra: { flag: false } })

    const report = observer.report()
    expect(report.context.sampleCount).toBe(2)
    expect(report.fields.find((field) => field.path === 'id')?.samples).toBe(2)
    expect(report.fields.find((field) => field.path === 'extra.flag')?.samples).toBe(2)
    expect(observer.samples).toBeUndefined()
    expect(observer.snapshotState.fields.length).toBeGreaterThan(0)
  })

  it('keeps a newly observed field visible as review', () => {
    const observer = new SourceSchemaObserver({
      sourceId: 'fixture',
      policy: {
        id: { decision: FIELD_DECISIONS.CORE },
      },
    })
    observer.observe({ id: '1', newField: 42 })
    expect(observer.report().fields.find((field) => field.path === 'newField')).toMatchObject({
      severity: 'REVIEW',
      status: 'new',
    })
  })
})
