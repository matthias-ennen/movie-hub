export const FIELD_DECISIONS = Object.freeze({
  CORE: 'core',
  CAPABILITY: 'capability',
  EXTENSION: 'extension',
  REVIEW: 'review',
  REJECT: 'reject',
  DEPRECATED: 'deprecated',
})

export const FIELD_SEVERITY = Object.freeze({
  INFO: 'INFO',
  REVIEW: 'REVIEW',
  BREAKING: 'BREAKING',
})

const VALID_DECISIONS = new Set(Object.values(FIELD_DECISIONS))

function normalizePath(value) {
  return String(value || '').trim().replace(/^\.+|\.+$/g, '')
}

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  return typeof value
}

function collectFields(value, prefix = '', result = new Map()) {
  if (!value || typeof value !== 'object' || value instanceof Date) return result
  const entries = Array.isArray(value)
    ? value.flatMap((item) => item && typeof item === 'object' ? Object.entries(item) : [])
    : Object.entries(value)

  for (const [key, child] of entries) {
    const path = normalizePath(prefix ? `${prefix}.${key}` : key)
    if (!path) continue
    const current = result.get(path) || { path, types: new Set(), samples: 0 }
    current.types.add(valueType(child))
    current.samples += 1
    result.set(path, current)

    if (child && typeof child === 'object' && !(child instanceof Date)) {
      collectFields(child, path, result)
    }
  }
  return result
}

export function sourceFieldSnapshot(value) {
  const fields = collectFields(value)
  return {
    fields: [...fields.values()].map((field) => ({
      path: field.path,
      types: [...field.types].sort(),
      samples: field.samples,
    })),
  }
}

export function mergeSourceFieldSnapshots(...snapshots) {
  const merged = new Map()
  for (const snapshot of snapshots.flat()) {
    for (const field of Array.isArray(snapshot?.fields) ? snapshot.fields : []) {
      const current = merged.get(field.path) || { path: field.path, types: new Set(), samples: 0 }
      for (const type of Array.isArray(field.types) ? field.types : []) current.types.add(String(type))
      current.samples += Number(field.samples) || 0
      merged.set(field.path, current)
    }
  }
  return {
    fields: [...merged.values()]
      .map((field) => ({ path: field.path, types: [...field.types].sort(), samples: field.samples }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}

export function normalizeFieldPolicy(raw = {}) {
  const normalized = {}
  for (const [path, config] of Object.entries(raw || {})) {
    const fieldPath = normalizePath(path)
    if (!fieldPath) continue
    const value = typeof config === 'string' ? { decision: config } : { ...(config || {}) }
    if (!VALID_DECISIONS.has(value.decision)) {
      throw new TypeError(`Invalid field policy decision for ${fieldPath}`)
    }
    normalized[fieldPath] = {
      decision: value.decision,
      capability: value.capability || null,
      extensionNamespace: value.extensionNamespace || null,
      reason: value.reason || null,
      expectedTypes: Array.isArray(value.expectedTypes)
        ? [...new Set(value.expectedTypes.map(String))]
        : null,
    }
  }
  return normalized
}

export function inspectSourceFieldSnapshot(snapshot, {
  sourceId,
  policy = {},
  previousSnapshot = null,
} = {}) {
  const normalizedPolicy = normalizeFieldPolicy(policy)
  const fields = new Map(
    (Array.isArray(snapshot?.fields) ? snapshot.fields : []).map((field) => [
      field.path,
      {
        path: field.path,
        types: new Set(Array.isArray(field.types) ? field.types : []),
        samples: Number(field.samples) || 0,
      },
    ]),
  )
  const previous = new Map(
    (Array.isArray(previousSnapshot?.fields) ? previousSnapshot.fields : [])
      .map((field) => [field.path, field]),
  )

  const inheritedPolicy = (path) => {
    const segments = String(path).split('.')
    while (segments.length > 1) {
      segments.pop()
      const parent = normalizedPolicy[segments.join('.')]
      if (!parent) continue
      if ([FIELD_DECISIONS.EXTENSION, FIELD_DECISIONS.REJECT, FIELD_DECISIONS.DEPRECATED].includes(parent.decision)) {
        return {
          ...parent,
          reason: parent.reason || `Inherited from parent ${parent.decision} policy.`,
        }
      }
      return null
    }
    return null
  }

  const report = []
  for (const field of [...fields.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const types = [...field.types].sort()
    const policyEntry = normalizedPolicy[field.path] || inheritedPolicy(field.path)
    const previousField = previous.get(field.path)
    const typeChanged = Boolean(previousField)
      && JSON.stringify([...(previousField.types || [])].sort()) !== JSON.stringify(types)

    let severity = FIELD_SEVERITY.INFO
    let status = 'known'

    if (!policyEntry) {
      severity = FIELD_SEVERITY.REVIEW
      status = 'new'
    } else if (typeChanged) {
      severity = FIELD_SEVERITY.BREAKING
      status = 'type-changed'
    } else if (policyEntry.decision === FIELD_DECISIONS.REVIEW) {
      severity = FIELD_SEVERITY.REVIEW
      status = 'review'
    } else if (policyEntry.expectedTypes?.length && !types.every((type) => policyEntry.expectedTypes.includes(type))) {
      severity = FIELD_SEVERITY.BREAKING
      status = 'unexpected-type'
    } else if (policyEntry.decision === FIELD_DECISIONS.REJECT || policyEntry.decision === FIELD_DECISIONS.DEPRECATED) {
      severity = FIELD_SEVERITY.INFO
      status = policyEntry.decision
    } else {
      status = policyEntry.decision
    }

    report.push({
      path: field.path,
      types,
      samples: field.samples,
      severity,
      status,
      decision: policyEntry?.decision || FIELD_DECISIONS.REVIEW,
      reason: policyEntry?.reason || null,
      capability: policyEntry?.capability || null,
      extensionNamespace: policyEntry?.extensionNamespace || null,
    })
  }

  for (const previousField of previous.values()) {
    if (fields.has(previousField.path)) continue
    const policyEntry = normalizedPolicy[previousField.path]
    report.push({
      path: previousField.path,
      types: [],
      samples: 0,
      severity: policyEntry?.decision === FIELD_DECISIONS.REJECT
        ? FIELD_SEVERITY.INFO
        : FIELD_SEVERITY.BREAKING,
      status: 'missing',
      decision: policyEntry?.decision || FIELD_DECISIONS.REVIEW,
      reason: policyEntry?.reason || null,
      capability: policyEntry?.capability || null,
      extensionNamespace: policyEntry?.extensionNamespace || null,
    })
  }

  report.sort((a, b) => {
    const rank = { BREAKING: 0, REVIEW: 1, INFO: 2 }
    return rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path)
  })

  return {
    sourceId: String(sourceId || 'unknown-source'),
    generatedAt: new Date().toISOString(),
    summary: {
      breaking: report.filter((entry) => entry.severity === FIELD_SEVERITY.BREAKING).length,
      review: report.filter((entry) => entry.severity === FIELD_SEVERITY.REVIEW).length,
      info: report.filter((entry) => entry.severity === FIELD_SEVERITY.INFO).length,
    },
    fields: report,
  }
}

export function inspectSourceSchema(records, options = {}) {
  const snapshot = mergeSourceFieldSnapshots(
    ...(Array.isArray(records) ? records : [records]).map((record) => sourceFieldSnapshot(record)),
  )
  return inspectSourceFieldSnapshot(snapshot, options)
}

export function schemaSnapshotFromReport(report) {
  return {
    sourceId: report?.sourceId || null,
    generatedAt: report?.generatedAt || null,
    fields: (Array.isArray(report?.fields) ? report.fields : [])
      .filter((field) => field.status !== 'missing')
      .map((field) => ({
        path: field.path,
        types: field.types,
      })),
  }
}
