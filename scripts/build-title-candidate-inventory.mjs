import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TITLE_CANDIDATE_INVENTORY_VERSION = 1
export const CANDIDATE_SOURCES = Object.freeze(['browse', 'personal-tmdb', 'movie-hub', 'waipu'])

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'movie-hub-62459'
const inventoryPath = resolve(process.env.TITLE_CANDIDATE_INVENTORY || 'artifacts/title-candidate-inventory.json')
const summaryPath = resolve(process.env.TITLE_CANDIDATE_INVENTORY_SUMMARY || 'artifacts/title-candidate-inventory-summary.json')

function mediaType(value) {
  const raw = value?.type ?? value?.mediaType ?? value?.media_type
  if (raw === 'series' || raw === 'tv') return 'series'
  if (raw === 'movie') return 'movie'
  return null
}

export function canonicalTitleIdentity(value) {
  const type = mediaType(value)
  const tmdbId = Number(value?.tmdbId ?? value?.id)
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0) return null
  return { key: `${type}:${tmdbId}`, type, tmdbId }
}

function documentValue(document) {
  return typeof document?.data === 'function' ? document.data() : document?.data
}

function documentPath(document) {
  return String(document?.ref?.path ?? document?.path ?? '')
}

function validUserDocumentPath(path, collection) {
  const segments = String(path).split('/')
  return segments.length === 4 && segments[0] === 'users' && segments[2] === collection
}

function sourceValues({ catalog, personalDocuments, movieHubDocuments, waipuTitles }) {
  return {
    browse: (Array.isArray(catalog?.titles) ? catalog.titles : []).map((value) => ({ value, eligible: true })),
    'personal-tmdb': (Array.isArray(personalDocuments) ? personalDocuments : []).map((document) => {
      const value = documentValue(document)
      return {
        value,
        eligible: validUserDocumentPath(documentPath(document), 'tmdbCatalog'),
      }
    }),
    'movie-hub': (Array.isArray(movieHubDocuments) ? movieHubDocuments : []).map((document) => {
      const data = documentValue(document)
      return {
        value: data?.titleRef,
        eligible: validUserDocumentPath(documentPath(document), 'sharedMedia') && data?.hasMedia === true,
      }
    }),
    waipu: (Array.isArray(waipuTitles?.entries) ? waipuTitles.entries : []).map((value) => ({ value, eligible: true })),
  }
}

function collectSource(source, references, candidates) {
  const unique = new Set()
  let eligibleReferences = 0
  let rejectedReferences = 0

  for (const reference of references) {
    if (!reference.eligible) {
      rejectedReferences += 1
      continue
    }
    const identity = canonicalTitleIdentity(reference.value)
    if (!identity) {
      rejectedReferences += 1
      continue
    }
    eligibleReferences += 1
    unique.add(identity.key)
    const candidate = candidates.get(identity.key) || { ...identity, sources: [] }
    if (!candidate.sources.includes(source)) candidate.sources.push(source)
    candidates.set(identity.key, candidate)
  }

  return {
    rawReferences: references.length,
    eligibleReferences,
    rejectedReferences,
    uniqueTitles: unique.size,
    duplicateReferences: Math.max(0, eligibleReferences - unique.size),
  }
}

function countMediaTypes(values) {
  return values.reduce((counts, value) => {
    counts[value.type] += 1
    return counts
  }, { movie: 0, series: 0 })
}

function unresolvedWaipuSummary(waipuUnresolved, waipuIndex) {
  const entries = Array.isArray(waipuUnresolved?.entries) ? waipuUnresolved.entries : []
  const reasons = entries.reduce((counts, entry) => {
    const reason = String(entry?.reason || 'unknown')
    counts[reason] = (counts[reason] || 0) + 1
    return counts
  }, {})
  const metricReasons = waipuIndex?.metrics?.matchRejected
  const fallbackReasons = metricReasons && typeof metricReasons === 'object' ? metricReasons : {}
  const fallbackCount = Object.values(fallbackReasons).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
  return {
    detailsAvailable: waipuUnresolved?.kind === 'waipu-unresolved-programs',
    programs: entries.length || fallbackCount,
    reasons: entries.length ? reasons : fallbackReasons,
    entries,
  }
}

export function buildTitleCandidateInventory({
  catalog = {},
  searchIndex = {},
  waipuTitles = {},
  waipuIndex = {},
  waipuUnresolved = {},
  personalDocuments = [],
  movieHubDocuments = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const candidates = new Map()
  const sources = sourceValues({ catalog, personalDocuments, movieHubDocuments, waipuTitles })
  const sourceStats = Object.fromEntries(CANDIDATE_SOURCES.map((source) => [
    source,
    collectSource(source, sources[source], candidates),
  ]))

  const candidateEntries = [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      sources: CANDIDATE_SOURCES.filter((source) => candidate.sources.includes(source)),
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
  const candidateKeys = new Set(candidateEntries.map(({ key }) => key))
  const searchKeys = new Set()
  let invalidSearchReferences = 0
  for (const entry of Array.isArray(searchIndex?.entries) ? searchIndex.entries : []) {
    const identity = canonicalTitleIdentity(entry)
    if (identity) searchKeys.add(identity.key)
    else invalidSearchReferences += 1
  }
  const searchOnlyKeys = [...searchKeys].filter((key) => !candidateKeys.has(key)).sort()
  const sourceCombinations = candidateEntries.reduce((counts, candidate) => {
    const combination = candidate.sources.join('+')
    counts[combination] = (counts[combination] || 0) + 1
    return counts
  }, {})
  const rawCandidateReferences = Object.values(sourceStats)
    .reduce((sum, source) => sum + source.eligibleReferences, 0)
  const unresolvedWaipu = unresolvedWaipuSummary(waipuUnresolved, waipuIndex)

  return {
    schemaVersion: TITLE_CANDIDATE_INVENTORY_VERSION,
    kind: 'title-candidate-inventory',
    generatedAt,
    identity: 'media-type+tmdb-id',
    policy: {
      candidateSources: [...CANDIDATE_SOURCES],
      searchIndexRole: 'classification-only',
      searchOnlyPreEnrichment: false,
      unresolvedWaipuMatching: 'separate-no-guessing',
    },
    counts: {
      rawCandidateReferences,
      canonicalCandidates: candidateEntries.length,
      deduplicatedReferences: Math.max(0, rawCandidateReferences - candidateEntries.length),
      overlappingCandidates: candidateEntries.filter(({ sources: memberships }) => memberships.length > 1).length,
      searchTitles: searchKeys.size,
      searchOnlyTitles: searchOnlyKeys.length,
      catalogRelevantSearchTitles: [...searchKeys].filter((key) => candidateKeys.has(key)).length,
      invalidSearchReferences,
      byMediaType: countMediaTypes(candidateEntries),
    },
    sourceStats,
    sourceCombinations,
    candidates: candidateEntries,
    searchOnly: {
      count: searchOnlyKeys.length,
      keys: searchOnlyKeys,
    },
    unresolvedWaipu,
  }
}

export function summarizeTitleCandidateInventory(inventory) {
  return {
    schemaVersion: inventory?.schemaVersion || TITLE_CANDIDATE_INVENTORY_VERSION,
    kind: 'title-candidate-inventory-summary',
    generatedAt: inventory?.generatedAt || null,
    identity: inventory?.identity || 'media-type+tmdb-id',
    policy: inventory?.policy || {},
    counts: inventory?.counts || {},
    sourceStats: inventory?.sourceStats || {},
    sourceCombinations: inventory?.sourceCombinations || {},
    unresolvedWaipu: {
      detailsAvailable: inventory?.unresolvedWaipu?.detailsAvailable === true,
      programs: Number(inventory?.unresolvedWaipu?.programs) || 0,
      reasons: inventory?.unresolvedWaipu?.reasons || {},
    },
  }
}

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId }, 'title-candidate-inventory')
  const db = getFirestore(app)
  const [catalog, searchIndex, waipuTitles, waipuIndex, waipuUnresolved, personalSnapshot, movieHubSnapshot] = await Promise.all([
    readJson('public/catalog.json', { titles: [] }),
    readJson('public/search-index.json', { entries: [] }),
    readJson('public/waipu-live/titles.json', { entries: [] }),
    readJson('public/waipu-live/index.json'),
    readJson('artifacts/waipu-live/unresolved.json'),
    db.collectionGroup('tmdbCatalog').get(),
    db.collectionGroup('sharedMedia').get(),
  ])
  const inventory = buildTitleCandidateInventory({
    catalog,
    searchIndex,
    waipuTitles,
    waipuIndex,
    waipuUnresolved,
    personalDocuments: personalSnapshot.docs,
    movieHubDocuments: movieHubSnapshot.docs,
  })
  await Promise.all([
    writeJson(inventoryPath, inventory),
    writeJson(summaryPath, summarizeTitleCandidateInventory(inventory)),
  ])
  console.log(
    `Titelkandidaten: ${inventory.counts.rawCandidateReferences} Referenzen → ${inventory.counts.canonicalCandidates} kanonische Titel`
    + ` · ${inventory.counts.searchOnlyTitles} nur Suche · ${inventory.unresolvedWaipu.programs} Waipu ungeklärt.`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
