/**
 * #336 G2d: SAME-RUN PRIVATE replay of original G2c source snapshots.
 *
 * Read previously staged real programme files from the ephemeral runner
 * without fetching a new feed. Simulate one isolated source outage using its
 * own snapshot as last-known-good. Emit ONLY fixed anonymised numbers.
 * This explicitly does NOT prove cross-run persistence or production failover.
 */
import { lstat, readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  replayXmltvPrivateLkg, isSafeXmltvG2dReplayReport,
} from '../src/sources/xmltv/xmltvPrivateLkgReplay.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PRIVATE = join(ROOT, 'artifacts/xmltv-g2/private')
const SOURCE_IDS = ['epgshare01', 'freeepg', 'iptv-epg-org']
const MAX_FILE_BYTES = 96 * 1024 * 1024

export async function runXmltvG2PrivateLkgReplay({
  privateRoot = PRIVATE, now = Date.now() + 30 * 60_000,
} = {}) {
  if (typeof privateRoot !== 'string' || !privateRoot.trim() ||
      !Number.isFinite(now)) throw new TypeError('Invalid private replay input')
  const folder = await lstat(privateRoot)
  if (!folder.isDirectory() || folder.isSymbolicLink() ||
      (folder.mode & 0o077) !== 0) {
    throw new TypeError('Unsafe private XMLTV staging directory')
  }
  const filenames = await readdir(privateRoot)
  if (!filenames.length ||
      filenames.some(name => !SOURCE_IDS.some(id => name === id + '.json'))) {
    throw new TypeError('Unexpected or missing private XMLTV source snapshots')
  }
  const generations = new Map()
  for (const filename of filenames) {
    const sourceId = filename.slice(0, -5)
    const path = join(privateRoot, filename)
    const st = await lstat(path)
    if (!st.isFile() || st.isSymbolicLink() ||
        (st.mode & 0o077) !== 0 ||
        st.size < 1 || st.size > MAX_FILE_BYTES) {
      throw new TypeError('Unsafe private XMLTV source snapshot')
    }
    generations.set(sourceId, JSON.parse(await readFile(path, 'utf8')))
  }

  const report = replayXmltvPrivateLkg(SOURCE_IDS.map(sourceId => ({
    sourceId,
    // Failure simulation: epgshare01 has NO current source. The already
    // staged true original generation is its only possible fallback.
    current: sourceId === 'epgshare01' ? null : generations.get(sourceId) ?? null,
    lastKnownGood: sourceId === 'epgshare01'
      ? generations.get(sourceId) ?? null : null,
  })), { now })
  if (!isSafeXmltvG2dReplayReport(report)) {
    throw new TypeError('Unsafe XMLTV replay aggregate')
  }
  return report
}

async function main() {
  if (process.argv.length !== 2) throw new TypeError('No source paths or arguments accepted')
  const report = await runXmltvG2PrivateLkgReplay()
  // No raw original programmes or private snapshots are ever printed/uploaded.
  process.stdout.write(JSON.stringify(report) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('XMLTV private replay unavailable; no data published.')
    process.exitCode = 1
  })
}
