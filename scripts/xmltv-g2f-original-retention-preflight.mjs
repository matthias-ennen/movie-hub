/**
 * MovieHub #336 G2f: inspect actual G2c originals only inside their existing
 * private ephemeral GitHub runner. Never upload, persist, publish, index or
 * forward 3rd-party XMLTV originals. Only a fixed numeric rights decision
 * aggregate is printed.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runXmltvG2PrivateLkgReplay } from './xmltv-g2-private-lkg-replay.mjs'
import {
  assessXmltvOriginalRetention, isSafeXmltvG2fRightsReport,
} from '../src/sources/xmltv/xmltvOriginalRetentionGate.js'

export async function runXmltvG2fOriginalRetentionPreflight({ now = Date.now() + 30 * 60_000 } = {}) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid XMLTV G2f clock')
  const replay = await runXmltvG2PrivateLkgReplay({ now })
  const report = assessXmltvOriginalRetention(replay)
  if (!isSafeXmltvG2fRightsReport(report) ||
      report.originalCloudObjectsCreated !== 0 ||
      report.originalExternalPublisherWrites !== 0) {
    throw new TypeError('Unsafe XMLTV original-retention report')
  }
  return report
}

async function main() {
  if (process.argv.length !== 2) {
    throw new TypeError('No cloud bucket, publish, source URL or retention arguments accepted')
  }
  const report = await runXmltvG2fOriginalRetentionPreflight()
  process.stdout.write(JSON.stringify(report) + '\n')
}

if (process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('G2f original XMLTV rights preflight denied; no source data published')
    process.exitCode = 1
  })
}
