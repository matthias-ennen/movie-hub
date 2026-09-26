import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectSourceSchema } from '../src/sources/fieldDiscovery.js'
import { buildFieldDiscoveryMarkdown } from '../src/sources/fieldDiscoveryReport.js'
import { WAIPU_FIELD_POLICY } from '../src/sources/policies/waipuFieldPolicy.js'
import { TMDB_WATCH_PROVIDER_FIELD_POLICY } from '../src/sources/policies/tmdbWatchProviderFieldPolicy.js'
import { WAIPU_SCHEMA_DISCOVERY_FIXTURE } from '../src/sources/fixtures/waipuSchemaDiscoveryFixture.js'
import { TMDB_WATCH_PROVIDER_DISCOVERY_FIXTURE } from '../src/sources/fixtures/tmdbWatchProviderSchemaDiscoveryFixture.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'artifacts', 'source-schema')

const reports = [
  inspectSourceSchema(WAIPU_SCHEMA_DISCOVERY_FIXTURE, {
    sourceId: 'waipu',
    policy: WAIPU_FIELD_POLICY,
  }),
  inspectSourceSchema(TMDB_WATCH_PROVIDER_DISCOVERY_FIXTURE, {
    sourceId: 'tmdb-watch-providers',
    policy: TMDB_WATCH_PROVIDER_FIELD_POLICY,
  }),
]

await mkdir(outputDir, { recursive: true })

for (const report of reports) {
  const base = resolve(outputDir, report.sourceId)
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(`${base}.md`, buildFieldDiscoveryMarkdown(report), 'utf8')
}

const combined = reports.map((report) => ({
  sourceId: report.sourceId,
  summary: report.summary,
  review: report.fields.filter((field) => field.severity === 'REVIEW').map((field) => field.path),
  breaking: report.fields.filter((field) => field.severity === 'BREAKING').map((field) => field.path),
}))

await writeFile(
  resolve(outputDir, 'summary.json'),
  `${JSON.stringify(combined, null, 2)}\n`,
  'utf8',
)

console.log(JSON.stringify(combined, null, 2))
