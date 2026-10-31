import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { projectStartupTitle, startupDetailBucket, STARTUP_CATALOG_VERSION } from '../src/catalog/startupCatalog.js'

export function buildStartupPublication(catalog) {
  if (!Array.isArray(catalog?.titles) || !catalog.titles.length || !Array.isArray(catalog.rowDefinitions)) {
    throw new Error('Startkatalog: vollständiger Quellkatalog fehlt.')
  }
  const generation = createHash('sha256').update(JSON.stringify({ version: STARTUP_CATALOG_VERSION, catalog })).digest('hex')
  const common = { version: STARTUP_CATALOG_VERSION, generation, generatedAt: catalog.generatedAt, titleCount: catalog.titles.length }
  const { titles, collections, smartFilterOptions, ...base } = catalog
  const listing = { ...base, ...common, kind: 'moviehub-startup-catalog', titles: titles.map(projectStartupTitle) }
  const files = new Map([['catalog.json', listing], ['filters.json', {
    ...common, kind: 'moviehub-startup-filters', smartFilterOptions: smartFilterOptions || {},
  }]])
  // Retain exact full records from the same generation for on-demand details.
  for (const title of titles) {
    const bucket = startupDetailBucket(title)
    if (!bucket) throw new Error(`Startkatalog: ungültige TMDB-Identität ${title.id}`)
    const path = `details-${bucket}.json`
    if (!files.has(path)) files.set(path, { ...common, kind: 'moviehub-startup-details', entries: [] })
    files.get(path).entries.push({ ...title, detailDeferred: false })
  }
  const manifest = { ...common, kind: 'moviehub-startup-manifest', catalogBytes: Buffer.byteLength(JSON.stringify(listing)) }
  return { manifest, files }
}

export async function publishStartupCatalog(catalog, directory) {
  const { manifest, files } = buildStartupPublication(catalog)
  // Build-owned output only, never the source catalog or a remote publication.
  await rm(directory, { recursive: true, force: true })
  const generationDir = resolve(directory, manifest.generation)
  await mkdir(generationDir, { recursive: true })
  for (const [name, value] of files) await writeFile(resolve(generationDir, name), JSON.stringify(value))
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest))
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'))
  if (catalog.source === 'fallback' && Array.isArray(catalog.titles) && catalog.titles.length === 0) {
    await rm(resolve('public/startup'), { recursive: true, force: true })
    console.log('Startup catalog: source-only checkout; local fallback remains available.')
  } else {
    const manifest = await publishStartupCatalog(catalog, resolve('public/startup'))
    console.log(`Startup catalog: ${manifest.titleCount} titles, ${manifest.catalogBytes} bytes, generation ${manifest.generation.slice(0, 12)}`)
  }
}
