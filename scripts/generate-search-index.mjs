import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSearchIndexArtifact } from '../src/search/searchIndex.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = resolve(root, 'public/catalog.json')
const searchIndexPath = resolve(root, 'public/search-index.json')

export async function generateSearchIndexFromCatalog() {
  const raw = await readFile(catalogPath, 'utf8')
  const catalog = JSON.parse(raw)

  if (catalog?.source !== 'tmdb' || !Array.isArray(catalog?.titles) || !catalog.titles.length) {
    throw new Error('A valid non-empty TMDB catalog is required before building the search index.')
  }

  const searchIndex = buildSearchIndexArtifact(catalog)
  if (!searchIndex.entries.length) throw new Error('Search index generation produced no entries.')

  await mkdir(dirname(searchIndexPath), { recursive: true })
  // Keep the search payload compact. At the target scale of tens of thousands
  // of entries, pretty-printed JSON would waste bandwidth without helping the client.
  await writeFile(searchIndexPath, `${JSON.stringify(searchIndex)}\n`, 'utf8')
  console.log(`Movie Hub search index generated: ${searchIndex.entries.length} entries -> public/search-index.json`)
  return searchIndex
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await generateSearchIndexFromCatalog()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
