import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = 'movie-hub-62459'
const number = '612913221205'
const region = 'europe-west3'
const root = `projects/${project}/locations/${region}`
const names = ['profileEmailAction', 'profileEmailRetry', 'profileEmailPreferences', 'profileEmailNotification']
const identities = {
  deployer: `github-movie-hub-deploy@${project}.iam.gserviceaccount.com`,
  eventReceiver: `movie-hub-email-events@${project}.iam.gserviceaccount.com`,
  eventarcAgent: `service-${number}@gcp-sa-eventarc.iam.gserviceaccount.com`,
  functionsAgent: `service-${number}@gcf-admin-robot.iam.gserviceaccount.com`,
  pubsubAgent: `service-${number}@gcp-sa-pubsub.iam.gserviceaccount.com`,
}
const knownRoles = ['roles/eventarc.serviceAgent', 'roles/eventarc.eventReceiver',
  'roles/eventarc.developer', 'roles/eventarc.admin', 'roles/cloudfunctions.serviceAgent',
  'roles/cloudfunctions.developer', 'roles/cloudfunctions.admin', 'roles/iam.serviceAccountUser',
  'roles/iam.serviceAccountTokenCreator', 'roles/run.invoker', 'roles/pubsub.serviceAgent']
const sdkEnv = () => ({ ...process.env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true' })

// Deliberately emit only recognized categories/identifiers, never error text,
// request/response payloads, arbitrary field values, tokens or email addresses.
export function summarizeFailure(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? {})
  const permissions = [...new Set(raw.match(/\b(?:eventarc|iam|cloudfunctions|run|pubsub|storage|artifactregistry|secretmanager)\.[A-Za-z]+\.[A-Za-z]+\b/g) || [])]
    .filter((item) => item !== 'iam.gserviceaccount.com').sort()
  const hints = []
  if (/permission denied while using (?:the )?eventarc service agent/i.test(raw)) hints.push('eventarc-service-agent-denied')
  if (/eventarc\.events\.receiveEvent|event receiver/i.test(raw)) hints.push('event-receiver-permission')
  if (/iam\.serviceAccounts\.actAs/i.test(raw)) hints.push('service-account-act-as')
  if (/service account.*(?:not found|does not exist)/i.test(raw)) hints.push('service-account-not-found')
  if (/PERMISSION_DENIED|permission|\b403\b|UNAUTHENTICATED|\b401\b/i.test(raw)) hints.push('permission-or-authentication')
  return { permissions, roles: knownRoles.filter((role) => raw.includes(role)),
    identities: Object.entries(identities).filter(([, email]) => raw.includes(email)).map(([name]) => name), hints }
}

function metadata(args, execute) {
  const result = execute('gcloud', [...args, `--project=${project}`, '--format=json', '--quiet'],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, env: sdkEnv() })
  if (result.error || result.signal) return { state: 'unreadable', reason: 'command-or-timeout' }
  if (result.status !== 0) return { state: 'unreadable', failure: summarizeFailure(result.stderr) }
  try { return { state: 'read', value: JSON.parse(result.stdout) } }
  catch { return { state: 'unreadable', reason: 'metadata-format' } }
}

export async function diagnoseEmailDeployment({ execute = spawnSync, request = fetch } = {}) {
  const functions = names.map((name) => {
    const result = metadata(['functions', 'describe', name, '--gen2', `--region=${region}`], execute)
    if (result.state !== 'read') return { name, ...result }
    const value = result.value
    if (value?.name !== `${root}/functions/${name}`) return { name, state: 'unreadable', reason: 'identity-mismatch' }
    return { name, state: ['ACTIVE', 'FAILED', 'DEPLOYING', 'DELETING', 'UNKNOWN'].includes(value.state) ? value.state : 'unknown',
      disabled: value.serviceConfig?.environmentVariables?.MOVIE_HUB_EMAIL_ENABLED === 'false',
      failure: summarizeFailure(value.stateMessages) }
  })
  const policy = metadata(['projects', 'get-iam-policy', project], execute)
  const roles = policy.state === 'read' && Array.isArray(policy.value?.bindings)
    ? { state: 'read', assignments: Object.entries(identities).map(([identity, email]) => ({ identity,
      roles: policy.value.bindings.filter((b) => !b.condition && b.members?.includes(`serviceAccount:${email}`))
        .map((b) => b.role).filter((role) => knownRoles.includes(role)).sort() })) }
    : { state: 'unreadable' }

  // A short-lived access token stays in memory and goes only to this fixed
  // Google metadata endpoint. Never return it, log it, or write it to a file.
  const auth = execute('gcloud', ['auth', 'print-access-token', `--project=${project}`, '--quiet'],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 65536, env: sdkEnv() })
  let operations = { state: 'unreadable', reason: 'authentication' }
  if (!auth.error && !auth.signal && auth.status === 0 && auth.stdout?.trim()) {
    const found = []
    let pageToken
    try {
      for (let page = 0; page < 5; page++) {
        const url = new URL(`https://cloudfunctions.googleapis.com/v2/${root}/operations`)
        url.searchParams.set('pageSize', '100')
        url.searchParams.set('fields', 'operations(name,metadata(target,createTime,endTime,verb,stages),done,error),nextPageToken')
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        const response = await request(url.href, { method: 'GET', redirect: 'error',
          headers: { Authorization: `Bearer ${auth.stdout.trim()}` }, signal: AbortSignal.timeout(30000) })
        if (!response.ok) { operations = { state: 'unreadable', httpStatus: response.status }; break }
        const body = await response.json()
        if (!Array.isArray(body.operations ?? [])) throw Error('metadata-format')
        for (const operation of body.operations || []) {
          const name = names.find((item) => operation.metadata?.target === `${root}/functions/${item}`)
          if (!name) continue
          const timestamp = operation.metadata?.createTime
          found.push({ name, created: typeof timestamp === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(timestamp) ? timestamp : null,
            done: operation.done === true, code: Number.isInteger(operation.error?.code) ? operation.error.code : null,
            failure: summarizeFailure({ error: operation.error, stages: operation.metadata?.stages }) })
        }
        pageToken = body.nextPageToken
        operations = { state: 'read', truncated: Boolean(pageToken), latest: names.flatMap((name) =>
          found.filter((item) => item.name === name).sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 3)) }
        if (!pageToken) break
      }
    } catch { operations = { state: 'unreadable', reason: 'request-or-metadata' } }
  }
  return { project, region, readOnly: true, functions, roles, operations }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await diagnoseEmailDeployment(), null, 2))
}
