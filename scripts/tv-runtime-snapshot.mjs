import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverLiveSourceCatalogs } from './live-availability-index.mjs'
import { buildTvRuntimeSnapshot } from '../src/tv/tvRuntimePublication.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'public')
const outputDir = resolve(publicDir, 'tv-runtime')

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

export async function writeTvRuntimeSnapshot({
  directory = publicDir,
  output = outputDir,
  catalogPath = resolve(publicDir, 'catalog.json'),
  searchIndexPath = resolve(publicDir, 'search-index.json'),
  now = Date.now(),
} = {}) {
  const [sourceCatalogs, catalog, searchIndex] = await Promise.all([
    discoverLiveSourceCatalogs(directory),
    readJson(catalogPath),
    readJson(searchIndexPath),
  ])
  const publication = buildTvRuntimeSnapshot({
    sourceCatalogs,
    catalog,
    searchIndex,
    now,
  })
  publication.index.sources = sourceCatalogs.map(({ providerId, generatedAt, sourceGenerationId }) => ({ providerId, generatedAt, sourceGenerationId }))

  const mergedAirings = publication.days.reduce((total, day) => (
    total + day.entries.reduce((sum, entry) => (
      sum + entry.airings.filter((airing) => airing.providerIds.length > 1).length
    ), 0)
  ), 0)
  publication.index.multiProviderAirings = mergedAirings

  await rm(output, { recursive: true, force: true })
  await mkdir(resolve(output, 'days'), { recursive: true })
  await writeFile(resolve(output, 'index.json'), `${JSON.stringify(publication.index)}\n`, 'utf8')
  await writeFile(resolve(output, 'hero.json'), `${JSON.stringify(publication.hero)}\n`, 'utf8')
  for (const day of publication.days) {
    await writeFile(resolve(output, 'days', `${day.key}.json`), `${JSON.stringify(day)}\n`, 'utf8')
  }

  const heroByteSize = Buffer.byteLength(JSON.stringify(publication.hero))
  const byteSize = Buffer.byteLength(JSON.stringify(publication.index))
    + heroByteSize
    + publication.days.reduce((total, day) => total + Buffer.byteLength(JSON.stringify(day)), 0)


  process.stdout.write(JSON.stringify({
    kind: publication.index.kind,
    generatedAt: publication.index.generatedAt,
    providers: publication.index.providers,
    days: publication.index.dayCount,
    titles: publication.index.titleCount,
    airings: publication.index.airingCount,
    multiProviderAirings: mergedAirings,
    heroCandidates: publication.hero.count,
    heroSourceTitles: publication.hero.sourceTitleCount,
    heroByteSize,
    byteSize,
  }, null, 2) + '\n')
  return publication
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeTvRuntimeSnapshot().catch((error) => {
    process.stderr.write((error?.stack || String(error)) + '\n')
    process.exitCode = 1
  })
}
