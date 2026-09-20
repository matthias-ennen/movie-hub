import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const SEARCH_INDEX_RUN_REPORT_VERSION = 1
export const DEFAULT_SEARCH_INDEX_QUALITY_THRESHOLDS = Object.freeze({
  minimumScanCount: 155,
  maximumSkippedResultRatio: 0.001,
  maximumTotalDropRatio: 0.1,
  maximumMediaTypeDropRatio: 0.1,
})

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

function dropRatio(previous, current) {
  return previous > 0 ? Math.max(0, (previous - current) / previous) : 0
}

export function evaluateSearchIndexRunReport(
  report,
  thresholds = DEFAULT_SEARCH_INDEX_QUALITY_THRESHOLDS,
) {
  const applied = { ...DEFAULT_SEARCH_INDEX_QUALITY_THRESHOLDS, ...thresholds }
  const scans = report?.scans || {}
  const index = report?.index || {}
  const previous = index.previous || {}
  const current = index.current || {}
  const reasons = []
  const totalDropRatio = dropRatio(Number(previous.total) || 0, Number(current.total) || 0)
  const movieDropRatio = dropRatio(Number(previous.movie) || 0, Number(current.movie) || 0)
  const seriesDropRatio = dropRatio(Number(previous.series) || 0, Number(current.series) || 0)
  const skippedResultRatio = Number(scans.rawResults) > 0
    ? (Number(scans.entries?.reduce((sum, scan) => sum + (Number(scan.skippedResults) || 0), 0)) || 0) / Number(scans.rawResults)
    : 0

  if (!index.baselineAvailable) reasons.push('The previous live search index baseline is unavailable.')
  if ((Number(scans.expected) || 0) < applied.minimumScanCount) {
    reasons.push(`Only ${Number(scans.expected) || 0} scans were scheduled; at least ${applied.minimumScanCount} are required.`)
  }
  if ((Number(scans.completed) || 0) !== (Number(scans.expected) || 0)) {
    reasons.push(`${Number(scans.completed) || 0}/${Number(scans.expected) || 0} scans completed.`)
  }
  if (skippedResultRatio > applied.maximumSkippedResultRatio) {
    reasons.push(`Skipped-result ratio ${(skippedResultRatio * 100).toFixed(3)}% exceeds ${(applied.maximumSkippedResultRatio * 100).toFixed(3)}%.`)
  }
  if (totalDropRatio > applied.maximumTotalDropRatio) {
    reasons.push(`Total index drop ${(totalDropRatio * 100).toFixed(2)}% exceeds ${(applied.maximumTotalDropRatio * 100).toFixed(2)}%.`)
  }
  if (movieDropRatio > applied.maximumMediaTypeDropRatio) {
    reasons.push(`Movie index drop ${(movieDropRatio * 100).toFixed(2)}% exceeds ${(applied.maximumMediaTypeDropRatio * 100).toFixed(2)}%.`)
  }
  if (seriesDropRatio > applied.maximumMediaTypeDropRatio) {
    reasons.push(`Series index drop ${(seriesDropRatio * 100).toFixed(2)}% exceeds ${(applied.maximumMediaTypeDropRatio * 100).toFixed(2)}%.`)
  }
  if (index.baselineAvailable
      && (Number(previous.total) || 0) + (Number(index.addedCount) || 0) - (Number(index.removedCount) || 0) !== (Number(current.total) || 0)) {
    reasons.push('Added and removed title counts do not reconcile with the index totals.')
  }

  return {
    passed: reasons.length === 0,
    thresholds: applied,
    metrics: {
      totalDropRatio,
      movieDropRatio,
      seriesDropRatio,
      skippedResultRatio,
    },
    reasons,
  }
}

export async function writeSearchIndexRunReport(report, path = resolve('artifacts/search-index-run-report.json')) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}
