import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runJoynAdapterDiagnostic } from './joyn-adapter-diagnostic.mjs'
import { writeJoynLivePublicationAtomic } from './joyn-live-publication.mjs'
import { withWaipuSingleFlight } from './waipu-sync-coordinator.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

export async function runJoynLiveCatalog({
  now = Date.now(),
  outputDirectory = resolve(root, process.env.JOYN_LIVE_OUTPUT || 'public/joyn-live'),
} = {}) {
  const candidateOutput = resolve(root, 'artifacts/joyn-live-candidate')
  return withWaipuSingleFlight(resolve(root, 'artifacts/joyn-sync/active.lock'), async () => {
    const { summary, envelope, publication } = await runJoynAdapterDiagnostic({
      now,
      publicationOutput: candidateOutput,
      sourceGenerationPrefix: 'joyn-catalog',
    })

    const validation = await writeJoynLivePublicationAtomic(publication, outputDirectory)
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
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runJoynLiveCatalog().catch((error) => {
    process.stderr.write((error?.stack || String(error)) + '\n')
    process.exitCode = 1
  })
}
