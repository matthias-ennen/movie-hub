import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const SEARCH_INDEX_RUN_REPORT_VERSION = 1

function titleKey(entry) {
  const type = entry?.type === 'series' ? 'series' : 'movie'
  const tmdbId = Number(entry?.tmdbId)
  return Number.isInteger(tmdbId) && tmdbId > 0 ? `${type}:${tmdbId}` : null
}

function countTypes(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((counts, entry) => {
    if (entry?.type === 'series') counts.series += 1
    else if (entry?.type === 'movie') counts.movie += 1
    return counts
  }, { movie: 0, series: 0 })
}

function normalizedOffers(entry) {
  return (Array.isArray(entry?.providerOffers) ? entry.providerOffers : [])
    .filter((offer) => offer?.id)
    .map((offer) => ({
      id: String(offer.id),
      tmdbProviderId: Number.isFinite(Number(offer.tmdbProviderId)) ? Number(offer.tmdbProviderId) : null,
      offerTypes: [...new Set((Array.isArray(offer.offerTypes) ? offer.offerTypes : [])
        .map(String).filter(Boolean))].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)
      || String(left.tmdbProviderId).localeCompare(String(right.tmdbProviderId)))
}

function offerSignature(entry) {
  return JSON.stringify(normalizedOffers(entry))
}

function compactEntry(entry) {
  return {
    key: titleKey(entry),
    tmdbId: Number(entry.tmdbId),
    type: entry.type === 'series' ? 'series' : 'movie',
    title: String(entry.title || ''),
    providerOffers: normalizedOffers(entry),
  }
}

function membershipKeys(entry) {
  const type = entry?.type === 'series' ? 'series' : 'movie'
  return new Set(normalizedOffers(entry).flatMap((offer) => offer.offerTypes
    .map((offerType) => `${type}:${offer.id}:${offerType}`)))
}

function summarizeProviderOfferDeltas(added, removed, changedOffers) {
  const deltas = new Map()
  const add = (key, field) => {
    const [mediaType, providerId, offerType] = key.split(':')
    const current = deltas.get(key) || { key, mediaType, providerId, offerType, addedTitles: 0, removedTitles: 0 }
    current[field] += 1
    deltas.set(key, current)
  }
  for (const entry of added) membershipKeys(entry).forEach((key) => add(key, 'addedTitles'))
  for (const entry of removed) membershipKeys(entry).forEach((key) => add(key, 'removedTitles'))
  for (const change of changedOffers) {
    const before = membershipKeys({ type: change.type, providerOffers: change.before })
    const after = membershipKeys({ type: change.type, providerOffers: change.after })
    for (const key of after) if (!before.has(key)) add(key, 'addedTitles')
    for (const key of before) if (!after.has(key)) add(key, 'removedTitles')
  }
  return [...deltas.values()].sort((left, right) => (
    (right.addedTitles + right.removedTitles) - (left.addedTitles + left.removedTitles)
    || left.key.localeCompare(right.key)
  ))
}

export function buildSearchIndexDiff(previousEntries, currentEntries) {
  const previous = new Map((Array.isArray(previousEntries) ? previousEntries : [])
    .map((entry) => [titleKey(entry), entry]).filter(([key]) => key))
  const current = new Map((Array.isArray(currentEntries) ? currentEntries : [])
    .map((entry) => [titleKey(entry), entry]).filter(([key]) => key))
  const added = [...current]
    .filter(([key]) => !previous.has(key))
    .map(([, entry]) => compactEntry(entry))
  const removed = [...previous]
    .filter(([key]) => !current.has(key))
    .map(([, entry]) => compactEntry(entry))
  const changedOffers = [...current]
    .filter(([key, entry]) => previous.has(key) && offerSignature(previous.get(key)) !== offerSignature(entry))
    .map(([key, entry]) => ({
      key,
      tmdbId: Number(entry.tmdbId),
      type: entry.type === 'series' ? 'series' : 'movie',
      title: String(entry.title || previous.get(key)?.title || ''),
      before: normalizedOffers(previous.get(key)),
      after: normalizedOffers(entry),
    }))
  const byKey = (left, right) => left.key.localeCompare(right.key)
  added.sort(byKey)
  removed.sort(byKey)
  changedOffers.sort(byKey)
  return {
    added,
    removed,
    changedOffers,
    providerOfferDeltas: summarizeProviderOfferDeltas(added, removed, changedOffers),
  }
}

export function buildSearchIndexRunReport({
  scans = [],
  previousIndex = null,
  currentIndex = {},
  broadEntries = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const scanEntries = (Array.isArray(scans) ? scans : []).map((scan) => ({ ...scan }))
  const currentEntries = Array.isArray(currentIndex?.entries) ? currentIndex.entries : []
  const previousEntries = Array.isArray(previousIndex?.entries) ? previousIndex.entries : []
  const diff = previousIndex ? buildSearchIndexDiff(previousEntries, currentEntries) : {
    added: [],
    removed: [],
    changedOffers: [],
    providerOfferDeltas: [],
  }
  const previousTypes = countTypes(previousEntries)
  const currentTypes = countTypes(currentEntries)

  return {
    kind: 'search-index-run-report',
    version: SEARCH_INDEX_RUN_REPORT_VERSION,
    generatedAt,
    scans: {
      expected: scanEntries.length,
      completed: scanEntries.filter((scan) => scan.status === 'complete').length,
      capped: scanEntries.filter((scan) => scan.capped === true).length,
      withSkippedResults: scanEntries.filter((scan) => Number(scan.skippedResults) > 0).length,
      pagesFetched: scanEntries.reduce((sum, scan) => sum + (Number(scan.pagesFetched) || 0), 0),
      rawResults: scanEntries.reduce((sum, scan) => sum + (Number(scan.rawResults) || 0), 0),
      broadUniqueTitles: Array.isArray(broadEntries) ? broadEntries.length : 0,
      entries: scanEntries,
    },
    index: {
      baselineAvailable: Boolean(previousIndex),
      previous: {
        generatedAt: previousIndex?.generatedAt || null,
        total: previousEntries.length,
        ...previousTypes,
      },
      current: {
        generatedAt: currentIndex?.generatedAt || generatedAt,
        total: currentEntries.length,
        ...currentTypes,
      },
      delta: {
        total: currentEntries.length - previousEntries.length,
        movie: currentTypes.movie - previousTypes.movie,
        series: currentTypes.series - previousTypes.series,
      },
      addedCount: diff.added.length,
      removedCount: diff.removed.length,
      changedOfferCount: diff.changedOffers.length,
      added: diff.added,
      removed: diff.removed,
      changedOffers: diff.changedOffers,
      providerOfferDeltas: diff.providerOfferDeltas,
    },
  }
}

export async function writeSearchIndexRunReport(report, path = resolve('artifacts/search-index-run-report.json')) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}
