import { readFileSync } from 'node:fs'

// A read-only verification step. Run after private deployment, before any
// service IAM grant or creation of a scheduled job.
export function checkTvFunction(details) {
  const project = 'movie-hub-62459'
  const region = 'europe-west3'
  const expected = 'movieHubTvFinalReminder'
  const runtime = 'movie-hub-tv-final@' + project + '.iam.gserviceaccount.com'
  const build = 'movie-hub-tv-build@' + project + '.iam.gserviceaccount.com'
  if (details?.name !== 'projects/' + project + '/locations/' + region + '/functions/' + expected)
    throw new Error('Unexpected function target')
  if (details?.buildConfig?.runtime !== 'nodejs22'
    || !details?.buildConfig?.serviceAccount?.endsWith('/serviceAccounts/' + build))
    throw new Error('Function build identity or runtime mismatch')
  if (details?.serviceConfig?.serviceAccountEmail !== runtime)
    throw new Error('Unexpected function runtime identity')
  const runResourcePrefix = 'projects/' + project + '/locations/' + region + '/services/'
  const runResource = details?.serviceConfig?.service
  if (typeof runResource !== 'string' || !runResource.startsWith(runResourcePrefix))
    throw new Error('Unexpected Cloud Run service resource')
  const runService = runResource.slice(runResourcePrefix.length)
  if (!/^[a-z][a-z0-9-]*$/.test(runService))
    throw new Error('Unable to verify Cloud Run service')
  const uri = details?.serviceConfig?.uri
  let parsed
  try { parsed = new URL(uri) } catch { throw new Error('Unexpected private function URL') }
  // A scheduler ID token must never be sent to an arbitrary HTTPS host.
  if (typeof uri !== 'string' || parsed.protocol !== 'https:'
    || !parsed.hostname.endsWith('.run.app')
    || parsed.username || parsed.password || parsed.port
    || (uri !== parsed.origin && uri !== parsed.origin + '/'))
    throw new Error('Unexpected private function URL')
  return { runService, uri }
}
if (process.argv[1]?.endsWith('tv-final-deploy-guard.mjs') && process.argv[2]) {
  try {
    const result = checkTvFunction(JSON.parse(readFileSync(process.argv[2], 'utf8')))
    process.stdout.write(result.uri + '\n' + result.runService + '\n')
  } catch (error) {
    console.error('TV function deployment verification failed:', error.message)
    process.exitCode = 1
  }
}
