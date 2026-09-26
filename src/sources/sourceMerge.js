import {
  exactBroadcastEventKey,
  normalizeAvailability,
  normalizeBroadcastEvent,
  normalizeSourceEnvelope,
  titleRefKey,
} from './sourceAdapterContract.js'

function routeKey(route) {
  return [route?.providerId || '', route?.mode || '', route?.target || ''].join('|')
}

function sourceRefKey(ref) {
  return [ref?.sourceId || '', ref?.externalId || '', ref?.observedAt || ''].join('|')
}

function unique(values, keyFn) {
  const map = new Map()
  for (const value of values || []) {
    const key = keyFn(value)
    if (!key || map.has(key)) continue
    map.set(key, value)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
}

function activeRecord(record, nowMs) {
  if (record?.kind === 'broadcast') return Date.parse(record.endAt) > nowMs
  if (record?.kind === 'availability') {
    return !record.validUntil || Date.parse(record.validUntil) > nowMs
  }
  return false
}

function availabilityMergeKey(record) {
  return [
    titleRefKey(record.titleRef),
    record.providerId,
    record.region || '',
    record.accessType,
    record.validFrom || '',
    record.validUntil || '',
  ].join('|')
}

function mergeBroadcast(left, right) {
  return normalizeBroadcastEvent({
    ...left,
    playbackRoutes: unique([...left.playbackRoutes, ...right.playbackRoutes], routeKey),
    sourceRefs: unique([...left.sourceRefs, ...right.sourceRefs], sourceRefKey),
    capabilities: { ...left.capabilities, ...right.capabilities },
    extensions: { ...left.extensions, ...right.extensions },
  })
}

function mergeAvailability(left, right) {
  return normalizeAvailability({
    ...left,
    playbackRoutes: unique([...left.playbackRoutes, ...right.playbackRoutes], routeKey),
    sourceRefs: unique([...left.sourceRefs, ...right.sourceRefs], sourceRefKey),
    capabilities: { ...left.capabilities, ...right.capabilities },
    extensions: { ...left.extensions, ...right.extensions },
  })
}

function normalizeFailure(value) {
  const sourceId = String(value?.sourceId || '').trim()
  if (!sourceId) return null
  return {
    sourceId,
    code: String(value?.code || 'SOURCE_FAILED'),
    message: String(value?.message || '').trim() || null,
    occurredAt: value?.occurredAt ? new Date(value.occurredAt).toISOString() : null,
  }
}

export function mergeSourceGenerations({
  generations = [],
  previousEnvelopes = [],
  failures = [],
} = {}, {
  now = Date.now(),
} = {}) {
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a finite timestamp.')

  const currentBySource = new Map()
  for (const raw of generations || []) {
    const envelope = normalizeSourceEnvelope(raw)
    currentBySource.set(envelope.sourceId, envelope)
  }

  const previousBySource = new Map()
  for (const raw of previousEnvelopes || []) {
    const envelope = normalizeSourceEnvelope(raw)
    previousBySource.set(envelope.sourceId, envelope)
  }

  const failureBySource = new Map()
  for (const raw of failures || []) {
    const failure = normalizeFailure(raw)
    if (failure) failureBySource.set(failure.sourceId, failure)
  }

  const sourceIds = [...new Set([
    ...currentBySource.keys(),
    ...previousBySource.keys(),
    ...failureBySource.keys(),
  ])].sort()

  const selectedEnvelopes = []
  const sourceStatuses = []

  for (const sourceId of sourceIds) {
    const current = currentBySource.get(sourceId)
    const previous = previousBySource.get(sourceId)
    const failure = failureBySource.get(sourceId)

    if (current && !failure) {
      const active = current.records.filter((record) => activeRecord(record, nowMs))
      selectedEnvelopes.push({ ...current, records: active })
      sourceStatuses.push({
        sourceId,
        status: current.sourceStatus,
        generationId: current.sourceGenerationId,
        generatedAt: current.generatedAt,
        ageMs: Math.max(0, nowMs - Date.parse(current.generatedAt)),
        retainedPrevious: false,
        recordsBeforeExpiry: current.records.length,
        activeRecords: active.length,
        expiredRecordsDropped: current.records.length - active.length,
        failure: null,
      })
      continue
    }

    if (previous) {
      const active = previous.records.filter((record) => activeRecord(record, nowMs))
      selectedEnvelopes.push({ ...previous, sourceStatus: 'stale', records: active })
      sourceStatuses.push({
        sourceId,
        status: failure ? 'failed' : 'stale',
        generationId: previous.sourceGenerationId,
        generatedAt: previous.generatedAt,
        ageMs: Math.max(0, nowMs - Date.parse(previous.generatedAt)),
        retainedPrevious: true,
        recordsBeforeExpiry: previous.records.length,
        activeRecords: active.length,
        expiredRecordsDropped: previous.records.length - active.length,
        failure: failure || null,
      })
      continue
    }

    sourceStatuses.push({
      sourceId,
      status: 'failed',
      generationId: null,
      generatedAt: null,
      ageMs: null,
      retainedPrevious: false,
      recordsBeforeExpiry: 0,
      activeRecords: 0,
      expiredRecordsDropped: 0,
      failure: failure || { sourceId, code: 'NO_VALID_GENERATION', message: null, occurredAt: null },
    })
  }

  const broadcasts = new Map()
  const availabilities = new Map()

  for (const envelope of selectedEnvelopes) {
    for (const record of envelope.records) {
      if (record.kind === 'broadcast') {
        const event = normalizeBroadcastEvent(record)
        const key = exactBroadcastEventKey(event)
        broadcasts.set(key, broadcasts.has(key) ? mergeBroadcast(broadcasts.get(key), event) : event)
      } else if (record.kind === 'availability') {
        const availability = normalizeAvailability(record)
        const key = availabilityMergeKey(availability)
        availabilities.set(key, availabilities.has(key)
          ? mergeAvailability(availabilities.get(key), availability)
          : availability)
      }
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    sourceStatuses,
    counts: {
      sources: sourceStatuses.length,
      healthySources: sourceStatuses.filter((s) => s.status === 'healthy').length,
      failedSources: sourceStatuses.filter((s) => s.status === 'failed').length,
      staleSources: sourceStatuses.filter((s) => s.status === 'stale').length,
      broadcastEvents: broadcasts.size,
      availabilities: availabilities.size,
    },
    broadcastEvents: [...broadcasts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value),
    availabilities: [...availabilities.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value),
  }
}
