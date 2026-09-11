import { generateSearchDetailsFromCatalog } from './generate-search-index.mjs'

try {
  await generateSearchDetailsFromCatalog()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
