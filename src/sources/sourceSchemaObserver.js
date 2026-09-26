import {
  inspectSourceFieldSnapshot,
  mergeSourceFieldSnapshots,
  schemaSnapshotFromReport,
  sourceFieldSnapshot,
} from './fieldDiscovery.js'

export class SourceSchemaObserver {
  constructor({
    sourceId,
    policy = {},
    previousSnapshot = null,
    onReport = null,
  } = {}) {
    this.sourceId = String(sourceId || 'unknown-source')
    this.policy = policy
    this.previousSnapshot = previousSnapshot
    this.onReport = typeof onReport === 'function' ? onReport : null
    this.snapshotState = { fields: [] }
    this.sampleCount = 0
  }

  observe(value, context = {}) {
    if (value === null || value === undefined) return null
    this.snapshotState = mergeSourceFieldSnapshots(
      this.snapshotState,
      sourceFieldSnapshot(value),
    )
    this.sampleCount += 1
    const report = this.report(context)
    if (this.onReport) this.onReport(report)
    return report
  }

  report(context = {}) {
    return {
      ...inspectSourceFieldSnapshot(this.snapshotState, {
        sourceId: this.sourceId,
        policy: this.policy,
        previousSnapshot: this.previousSnapshot,
      }),
      context: {
        ...context,
        sampleCount: this.sampleCount,
      },
    }
  }

  snapshot() {
    return schemaSnapshotFromReport(this.report())
  }
}
