import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmdbChangedTitleKeys } from './tmdb-change-queue.mjs'

export const TITLE_PRIORITY_PREVIEW_VERSION = 1
export const TITLE_CANDIDATE_STATE_VERSION = 1

const previewPath = resolve(process.env.TITLE_PRIORITY_PREVIEW || 'artifacts/title-priority-preview.json')
const summaryPath = resolve(process.env.TITLE_PRIORITY_PREVIEW_SUMMARY || 'artifacts/title-priority-preview-summary.json')
const statePath = resolve(process.env.TITLE_CANDIDATE_STATE || 'artifacts/title-candidate-state.json')

const PRIORITIES = Object.freeze({
  INCOMPLETE: { rank: 1, id: 'incomplete-or-failed' },
  NEW: { rank: 2, id: 'new-catalog-relevant' },
  CHANGED: { rank: 3, id: 'tmdb-changed' },
  STRUCTURAL: { rank: 4, id: 'structural-gap' },
  STALE: { rank: 5, id: 'stale' },
})

function normalizeState(state) {
  if (state?.kind !== 'title-candidate-state' || Number(state?.schemaVersion) !== TITLE_CANDIDATE_STATE_VERSION) {
    return null
  }
  return {
    generatedAt: state.generatedAt || null,
    keys: [...new Set((Array.isArray(state.keys) ? state.keys : []).map(String).filter(Boolean))].sort(),
  }
}

export function buildTitleCandidateState(inventory) {
  return {
    schemaVersion: TITLE_CANDIDATE_STATE_VERSION,
    kind: 'title-candidate-state',
    generatedAt: inventory?.generatedAt || new Date().toISOString(),
    keys: [...new Set((Array.isArray(inventory?.candidates) ? inventory.candidates : [])
      .map(({ key }) => String(key || '')).filter(Boolean))].sort(),
  }
}

function priorityFor({ incomplete, isNew, changed, structuralGap, stale }) {
  if (incomplete) return PRIORITIES.INCOMPLETE
  if (isNew) return PRIORITIES.NEW
  if (changed) return PRIORITIES.CHANGED
  if (structuralGap) return PRIORITIES.STRUCTURAL
  if (stale) return PRIORITIES.STALE
  return null
}

function reasonsFor({ incomplete, failed, isNew, changed, structuralGap, stale }) {
  return [
    incomplete && 'incomplete-target',
    failed && 'failed-check',
    isNew && 'new-catalog-relevant',
    changed && 'tmdb-changed',
    structuralGap && 'structural-gap',
    stale && 'stale',
  ].filter(Boolean)
}

function byQueueOrder(left, right) {
  return left.priority.rank - right.priority.rank
    || Number(right.fetchRequired) - Number(left.fetchRequired)
    || String(left.metadata.latestUpdatedAt || '').localeCompare(String(right.metadata.latestUpdatedAt || ''))
    || left.key.localeCompare(right.key)
}

export function buildTitlePriorityPreview({
  inventory = {},
  changeSet = null,
  previousState = null,
  capacity = 800,
  generatedAt = inventory?.generatedAt || new Date().toISOString(),
} = {}) {
  const baseline = normalizeState(previousState)
  const previousKeys = new Set(baseline?.keys || [])
  const candidates = Array.isArray(inventory?.candidates) ? inventory.candidates : []
  const currentKeys = new Set(candidates.map(({ key }) => key).filter(Boolean))
  const changesAvailable = changeSet?.kind === 'tmdb-change-set'
  const changedKeys = changesAvailable ? tmdbChangedTitleKeys(changeSet) : new Set()
  const queue = []
  let upToDate = 0

  for (const candidate of candidates) {
    const metadata = candidate?.metadata || {}
    const failed = Number(metadata.failedReferences) > 0
    const structuralOnlyGapReferences = Number(metadata.structuralOnlyGapReferences) || 0
    const structuralGap = structuralOnlyGapReferences > 0
    const incomplete = failed || Number(metadata.incompleteReferences) > structuralOnlyGapReferences
    const stale = Number(metadata.staleReferences) > 0
    const isNew = Boolean(baseline) && !previousKeys.has(candidate.key)
    const changed = changedKeys.has(candidate.key)
    const priority = priorityFor({ incomplete, isNew, changed, structuralGap, stale })
    if (!priority) {
      upToDate += 1
      continue
    }
    const fetchRequired = changed || metadata.freshCompleteAvailable !== true
    queue.push({
      key: candidate.key,
      type: candidate.type,
      tmdbId: candidate.tmdbId,
      sources: candidate.sources,
      priority,
      reasons: reasonsFor({ incomplete, failed, isNew, changed, structuralGap, stale }),
      action: fetchRequired ? 'fetch-tmdb' : 'reuse-canonical',
      fetchRequired,
      metadata,
    })
  }
  queue.sort(byQueueOrder)
  const safeCapacity = Math.max(0, Math.floor(Number(capacity) || 0))
  const selected = queue.slice(0, safeCapacity)
  const priorities = Object.fromEntries(Object.values(PRIORITIES).map(({ id }) => [id, 0]))
  for (const entry of queue) priorities[entry.priority.id] += 1
  const uniqueQueueKeys = new Set(queue.map(({ key }) => key))
  const departedCandidates = baseline
    ? baseline.keys.filter((key) => !currentKeys.has(key)).length
    : null

  return {
    schemaVersion: TITLE_PRIORITY_PREVIEW_VERSION,
    kind: 'title-priority-preview',
    generatedAt,
    mode: 'read-only',
    policy: {
      oneQueueEntryPerIdentity: true,
      maximumTmdbDetailRequestsPerIdentity: 1,
      searchOnlyExcluded: true,
      writesMetadata: false,
    },
    inputs: {
      candidates: candidates.length,
      baselineAvailable: Boolean(baseline),
      baselineGeneratedAt: baseline?.generatedAt || null,
      changeSetAvailable: changesAvailable,
      changeSetGeneratedAt: changesAvailable ? changeSet.generatedAt || null : null,
      capacity: safeCapacity,
    },
    counts: {
      queued: queue.length,
      selectedWithinCapacity: selected.length,
      backlog: Math.max(0, queue.length - selected.length),
      fetchRequired: queue.filter(({ fetchRequired }) => fetchRequired).length,
      reusableCanonical: queue.filter(({ fetchRequired }) => !fetchRequired).length,
      upToDate,
      newCandidates: baseline ? candidates.filter(({ key }) => !previousKeys.has(key)).length : null,
      departedCandidates,
      duplicateQueueEntries: queue.length - uniqueQueueKeys.size,
      priorities,
    },
    queue,
    selectedKeys: selected.map(({ key }) => key),
  }
}

export function summarizeTitlePriorityPreview(preview) {
  return {
    schemaVersion: preview?.schemaVersion || TITLE_PRIORITY_PREVIEW_VERSION,
    kind: 'title-priority-preview-summary',
    generatedAt: preview?.generatedAt || null,
    mode: preview?.mode || 'read-only',
    policy: preview?.policy || {},
    inputs: preview?.inputs || {},
    counts: preview?.counts || {},
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(path, value, { atomic = false } = {}) {
  await mkdir(dirname(path), { recursive: true })
  const output = `${JSON.stringify(value, null, 2)}\n`
  if (!atomic) {
    await writeFile(path, output, 'utf8')
    return
  }
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, path)
}

async function main() {
  const [inventory, changeSet, previousState] = await Promise.all([
    readJson(process.env.TITLE_CANDIDATE_INVENTORY || 'artifacts/title-candidate-inventory.json', {}),
    readJson(process.env.TMDB_CHANGE_SET || 'artifacts/tmdb-data/change-set.json'),
    readJson(statePath),
  ])
  if (inventory?.kind !== 'title-candidate-inventory') throw new Error('A valid title candidate inventory is required.')
  const preview = buildTitlePriorityPreview({
    inventory,
    changeSet,
    previousState,
    capacity: Number(process.env.TITLE_PRIORITY_PREVIEW_LIMIT) || 800,
  })
  await Promise.all([
    writeJson(previewPath, preview),
    writeJson(summaryPath, summarizeTitlePriorityPreview(preview)),
  ])
  await writeJson(statePath, buildTitleCandidateState(inventory), { atomic: true })
  console.log(
    `Prioritätsvorschau: ${preview.counts.queued}/${preview.inputs.candidates} eingeplant`
    + ` · ${preview.counts.fetchRequired} TMDB-Abrufe · ${preview.counts.reusableCanonical} Wiederverwendungen`
    + ` · ${preview.counts.backlog} außerhalb der Kapazität · ${preview.counts.duplicateQueueEntries} Dubletten.`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
