import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runJoynAdapterDiagnostic } from './joyn-adapter-diagnostic.mjs'
import { writeJoynLivePublicationAtomic } from './joyn-live-publication.mjs'
import { withWaipuSingleFlight } from './waipu-sync-coordinator.mjs'
import { JoynSourceGuard } from './joyn-source-guard.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

export async function runJoynLiveCatalog({
  now = Date.now(),
  outputDirectory = resolve(root, process.env.JOYN_LIVE_OUTPUT || 'public/joyn-live'),
  resetSourceCircuit = false,
} = {}) {
  const candidateOutput = resolve(root, 'artifacts/joyn-live-candidate')
  return withWaipuSingleFlight(resolve(root, 'artifacts/joyn-sync/active.lock'), async () => {
    const guard = await JoynSourceGuard.load({ directory: resolve(root, 'artifacts/joyn-sync'), resetCircuit: resetSourceCircuit,
      budgets: { epg: Number(process.env.JOYN_EPG_REQUEST_BUDGET || 500),
        algolia: Number(process.env.JOYN_ALGOLIA_REQUEST_BUDGET || 3600),
        seriesDetail: Number(process.env.JOYN_SERIES_DETAIL_REQUEST_BUDGET || 100) } })
    try {
      guard.assertAvailable()
      const { summary, envelope, publication } = await runJoynAdapterDiagnostic({
        now,
        publicationOutput: candidateOutput,
        sourceGenerationPrefix: 'joyn-catalog',
        fetchImpl: guard.fetch,
        sourceHealth: () => guard.snapshot(),
      })

      const validation = await writeJoynLivePublicationAtomic(publication, outputDirectory)
      await guard.finish('complete')
      process.stdout.write(JSON.stringify({
        kind: 'joyn-live-catalog-publication',
        generatedAt: new Date(now).toISOString(),
        sourceGenerationId: envelope?.sourceGenerationId || null,
        outputDirectory,
        validation,
        summary: {
          upstreamStreams: summary?.upstream?.streams ?? null,
          upstreamPrograms: summary?.upstream?.programs ?? null,
          matchedPrograms: summary?.matching?.matchedPrograms ?? null,
          publishedStations: summary?.output?.publishedStations ?? null,
          publishedAirings: summary?.output?.publishedAirings ?? null,
        },
      }, null, 2) + '\n')

      return { summary, envelope, publication, validation }
    } catch (error) {
      await guard.finish('failed', error)
      throw error
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runJoynLiveCatalog({ resetSourceCircuit: process.argv.includes('--reset-circuit') }).catch((error) => {
    process.stderr.write((error?.stack || String(error)) + '\n')
    process.exitCode = 1
  })
}
