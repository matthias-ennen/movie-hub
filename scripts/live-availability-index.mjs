import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { buildLiveAvailabilityIndex } from '../src/sources/liveAvailabilityIndex.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'public')
const outputPath = resolve(publicDir, 'live-availability-index.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function discoverLiveSourceCatalogs(directory = publicDir) {
  const dirents = await readdir(directory, { withFileTypes: true })
  const sources = []
  for (const dirent of dirents) {
    if (!dirent.isDirectory() || !dirent.name.endsWith('-live')) continue
    const providerId = dirent.name.slice(0, -5).trim()
    if (!providerId) continue
    try {
      const raw = await readJson(resolve(directory, dirent.name, 'titles.json'))
      const entries = Array.isArray(raw?.entries) ? raw.entries : []
      if (!entries.length) continue
      sources.push({ providerId, entries })
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        process.stderr.write(`Availability source ${providerId} skipped: ${error.message}\n`)
      }
    }
  }
  return sources.sort((left, right) => left.providerId.localeCompare(right.providerId))
}

export async function writeLiveAvailabilityIndex({
  directory = publicDir,
  output = outputPath,
  now = Date.now(),
} = {}) {
  const sources = await discoverLiveSourceCatalogs(directory)
  const publication = buildLiveAvailabilityIndex(sources, { now })
  await mkdir(resolve(output, '..'), { recursive: true })
  await writeFile(output, `${JSON.stringify(publication)}\n`, 'utf8')
  process.stdout.write(JSON.stringify({
    kind: publication.kind,
    sources: publication.sources,
    titles: publication.count,
    maxAiringsPerProvider: publication.maxAiringsPerProvider,
    byteSize: Buffer.byteLength(JSON.stringify(publication)),
  }, null, 2) + '\n')
  return publication
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeLiveAvailabilityIndex().catch((error) => {
    process.stderr.write((error?.stack || String(error)) + '\n')
    process.exitCode = 1
  })
}
