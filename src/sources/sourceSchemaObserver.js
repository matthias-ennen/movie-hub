import { inspectSourceSchema, schemaSnapshotFromReport } from './fieldDiscovery.js'

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
    this.samples = []
  }

  observe(value, context = {}) {
    if (value === null || value === undefined) return null
    this.samples.push(value)
    const report = inspectSourceSchema(this.samples, {
      sourceId: this.sourceId,
      policy: this.policy,
      previousSnapshot: this.previousSnapshot,
    })
    const enriched = {
      ...report,
      context: {
        ...context,
        sampleCount: this.samples.length,
      },
    }
    if (this.onReport) this.onReport(enriched)
    return enriched
  }

  report(context = {}) {
    return {
      ...inspectSourceSchema(this.samples, {
        sourceId: this.sourceId,
        policy: this.policy,
        previousSnapshot: this.previousSnapshot,
      }),
      context: {
        ...context,
        sampleCount: this.samples.length,
      },
    }
  }

  snapshot() {
    return schemaSnapshotFromReport(this.report())
  }
}
