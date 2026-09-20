import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { titleNeedsMetadataEnrichment } from '../src/catalog/titleMetadata.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function countByType(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((counts, entry) => {
    if (entry?.type === 'series') counts.series += 1
    else if (entry?.type === 'movie') counts.movies += 1
    return counts
  }, { movies: 0, series: 0 })
}

export function buildDataStatus({ catalog, searchIndex, searchDetails, seriesManifest, generatedAt = null }) {
  const catalogTypes = countByType(catalog?.titles)
  const searchTypes = countByType(searchIndex?.entries)
  const completeDetails = (Array.isArray(searchDetails) ? searchDetails : [])
    .filter((entry) => !titleNeedsMetadataEnrichment(entry, { requireContract: true }))
  const completeTypes = countByType(completeDetails)
  const totalSearchDetails = Array.isArray(searchDetails) ? searchDetails.length : 0

  return {
    kind: 'movie-hub-data-status',
    version: 2,
    generatedAt: generatedAt
      || seriesManifest?.generatedAt
      || searchIndex?.generatedAt
      || catalog?.generatedAt
      || null,
    catalog: { total: catalogTypes.movies + catalogTypes.series, ...catalogTypes },
    searchIndex: { total: searchTypes.movies + searchTypes.series, ...searchTypes },
    completeSearchDetails: {
      total: completeDetails.length,
      pending: Math.max(0, totalSearchDetails - completeDetails.length),
      ...completeTypes,
    },
    seriesSeasons: {
      available: Number(seriesManifest?.availableSeasonCount) || 0,
      requested: Number(seriesManifest?.requestedSeasonCount) || 0,
      pending: Number(seriesManifest?.pendingSeasonCount) || 0,
    },
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readSearchDetails() {
  const directory = resolve(root, 'public/search-details')
  const manifest = await readJson(resolve(directory, 'manifest.json'))
  const shards = await Promise.all((manifest.shards || []).map(async (shard) => {
    const payload = await readJson(resolve(directory, `${shard.bucket}.json`))
    return Array.isArray(payload?.entries) ? payload.entries : []
  }))
  return shards.flat()
}

function toMarkdown(status) {
  return [
    '## Movie Hub data fill levels',
    '',
    '| Bereich | Gesamt | Filme | Serien | Offen |',
    '| --- | ---: | ---: | ---: | ---: |',
    `| Browse-Katalog | ${status.catalog.total} | ${status.catalog.movies} | ${status.catalog.series} | – |`,
    `| Suchindex | ${status.searchIndex.total} | ${status.searchIndex.movies} | ${status.searchIndex.series} | – |`,
    `| Vollständige Suchdetails | ${status.completeSearchDetails.total} | ${status.completeSearchDetails.movies} | ${status.completeSearchDetails.series} | ${status.completeSearchDetails.pending} |`,
    `| Serienstaffeln | ${status.seriesSeasons.available}/${status.seriesSeasons.requested} | – | – | ${status.seriesSeasons.pending} |`,
    '',
  ].join('\n')
}

export async function reportDataStatus() {
  const [catalog, searchIndex, searchDetails, seriesManifest] = await Promise.all([
    readJson(resolve(root, 'public/catalog.json')),
    readJson(resolve(root, 'public/search-index.json')),
    readSearchDetails(),
    readJson(resolve(root, 'public/series-details/manifest.json')),
  ])
  const status = buildDataStatus({
    catalog,
    searchIndex,
    searchDetails,
    seriesManifest,
    generatedAt: new Date().toISOString(),
  })
  const markdown = toMarkdown(status)
  console.log(markdown)
  await writeFile(
    resolve(root, 'public/data-status.json'),
    `${JSON.stringify(status)}\n`,
    'utf8',
  )
  console.log('Movie Hub data status generated -> public/data-status.json')
  if (process.env.GITHUB_STEP_SUMMARY && process.env.DATA_STATUS_APPEND_SUMMARY !== '0') {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
  }
  return status
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await reportDataStatus()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
