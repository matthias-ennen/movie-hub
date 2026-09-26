import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeSourceEnvelope } from '../src/sources/sourceAdapterContract.js'
import { addJoynPilotRouteToBroadcastEvent } from '../src/sources/joyn/joynPlaybackOverlay.js'
import { JOYN_PILOT_STATIONS } from '../src/sources/joyn/joynPilotStations.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}

export async function buildJoynPilotOverlay({
  waipuPath = resolve(root, 'artifacts/source-adapters/waipu-v1.json'),
  outputPath = resolve(root, 'artifacts/joyn-pilot/overlay.json'),
  verifiedAt = new Date().toISOString(),
} = {}) {
  const waipu = normalizeSourceEnvelope(await readJson(waipuPath))
  const allowedStations = new Set(JOYN_PILOT_STATIONS.map((station) => station.waipuStationId))

  const candidateEvents = waipu.records.filter((record) => (
    record?.kind === 'broadcast' && allowedStations.has(record.channelId)
  ))

  const enriched = candidateEvents.map((event) => (
    addJoynPilotRouteToBroadcastEvent(event, { verifiedAt })
  ))

  const added = enriched.filter((result) => result.added)
  const stationCounts = Object.fromEntries(
    JOYN_PILOT_STATIONS.map((station) => [
      station.waipuStationId,
      added.filter((result) => result.event.channelId === station.waipuStationId).length,
    ]),
  )

  const output = {
    schemaVersion: 1,
    kind: 'joyn-playback-overlay',
    generatedAt: verifiedAt,
    routeSource: 'joyn-public-link-inventory',
    eventTimingSource: 'waipu',
    quality: 'web-fallback',
    pilotStations: JOYN_PILOT_STATIONS.map((station) => ({
      stationKey: station.stationKey,
      name: station.name,
      joynSlug: station.joynSlug,
      waipuStationId: station.waipuStationId,
      joynUrl: station.joynUrl,
    })),
    counts: {
      waipuEvents: waipu.records.filter((record) => record?.kind === 'broadcast').length,
      pilotCandidateEvents: candidateEvents.length,
      routesAdded: added.length,
      stationsWithEvents: Object.values(stationCounts).filter((count) => count > 0).length,
    },
    stationCounts,
    records: added.map((result) => result.event),
  }

  if (output.counts.routesAdded !== output.counts.pilotCandidateEvents) {
    throw new Error('Joyn pilot overlay did not enrich every candidate event.')
  }
  if (output.records.some((event) => !event.sourceRefs.some((ref) => ref.sourceId === 'waipu'))) {
    throw new Error('Joyn pilot overlay lost Waipu event provenance.')
  }
  if (output.records.some((event) => !event.playbackRoutes.some((route) => route.providerId === 'joyn'))) {
    throw new Error('Joyn pilot overlay record is missing Joyn playback route.')
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildJoynPilotOverlay()
    .then((output) => process.stdout.write(`${JSON.stringify(output.counts, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
