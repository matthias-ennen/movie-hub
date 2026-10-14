import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

// Fixed project, fixed metadata commands. Never call secrets versions access,
// fetch user documents or print provider responses/credentials.
const project = 'movie-hub-62459'
const region = 'europe-west3'
const runtime = `movie-hub-email@${project}.iam.gserviceaccount.com`
const accounts = ['movie-hub-email', 'movie-hub-email-build', 'movie-hub-email-events', 'movie-hub-email-scheduler']
const checks = []
function inspect(args, format) {
  const result = spawnSync('gcloud', [...args, `--project=${project}`, `--format=${format}`, '--quiet'],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error || result.signal) return { state: 'unreadable', reason: 'command-or-timeout' }
  if (result.status !== 0) {
    // Do not mistake an authorization failure for a missing resource.
    const error = result.stderr || ''
    if (/PERMISSION_DENIED|permission|403|UNAUTHENTICATED|401/i.test(error)) {
      return { state: 'unreadable', reason: 'permission-or-authentication' }
    }
    return /NOT_FOUND|not found|404|does not exist/i.test(error)
      ? { state: 'missing' } : { state: 'unreadable', reason: 'command-failed' }
  }
  try { return { state: 'read', value: format.startsWith('json') ? JSON.parse(result.stdout) : result.stdout.trim() } }
  catch { return { state: 'unreadable', reason: 'metadata-format' } }
}
function check(name, result, valid, detail = '') {
  checks.push({ name, state: result.state === 'read' ? valid(result.value) ? 'ready' : 'needs-setup' : result.state,
    ...(result.reason ? { reason: result.reason } : {}), detail })
}

const apis = inspect(['services', 'list', '--enabled'], 'value(config.name)')
for (const api of ['cloudfunctions', 'cloudscheduler', 'run', 'cloudbuild', 'artifactregistry',
  'eventarc', 'pubsub', 'firestore', 'secretmanager', 'identitytoolkit']) {
  check(`API ${api}`, apis, (value) => value.split(/\s+/).includes(`${api}.googleapis.com`))
}
check('Firestore default database in europe-west3',
  inspect(['firestore', 'databases', 'describe', '--database=(default)'], 'json(locationId,type)'),
  (value) => value.locationId === region && value.type === 'FIRESTORE_NATIVE')
check('Cloud billing enabled', inspect(['billing', 'projects', 'describe', project], 'value(billingEnabled)'),
  (value) => value.toLowerCase() === 'true')

for (const name of ['RESEND_API_KEY', 'MOVIE_HUB_EMAIL_TOKEN_KEY']) {
  const version = inspect(['secrets', 'versions', 'describe', 'latest', `--secret=${name}`], 'json(state)')
  check(`Latest secret version enabled: ${name}`, version, (value) => value.state === 'ENABLED',
    'Metadata only; does not prove key validity or provider permissions.')
}
for (const account of accounts) {
  check(`Dedicated account: ${account}`,
    inspect(['iam', 'service-accounts', 'describe', `${account}@${project}.iam.gserviceaccount.com`], 'json(disabled)'),
    (value) => value.disabled !== true)
}

const role = inspect(['iam', 'roles', 'describe', 'MovieHubEmailRuntime'], 'json(includedPermissions,deleted,stage)')
const required = ['datastore.databases.get', 'datastore.entities.get', 'datastore.entities.list',
  'datastore.entities.create', 'datastore.entities.update', 'firebaseauth.users.get']
check('Restricted runtime role', role, (value) => !value.deleted && value.stage !== 'DISABLED'
  && Array.isArray(value.includedPermissions) && required.every((p) => value.includedPermissions.includes(p))
  && value.includedPermissions.every((p) => required.includes(p)), 'Read/create/update only; no IAM or document deletion.')
const policy = inspect(['projects', 'get-iam-policy', project], 'json(bindings)')
check('Runtime role assigned to dedicated account', policy,
  (value) => value.bindings?.some((b) => b.role === `projects/${project}/roles/MovieHubEmailRuntime`
    && b.members?.includes(`serviceAccount:${runtime}`)))

const field = inspect(['firestore', 'indexes', 'fields', 'describe', 'queueAt', '--collection-group=emailDeliveries', '--database=(default)'], 'json(indexConfig)')
check('Email retry collection-group index ready', field, (value) => value.indexConfig?.indexes?.some((index) =>
  index.queryScope === 'COLLECTION_GROUP' && index.state === 'READY'
  && index.fields?.some((f) => f.fieldPath === 'queueAt' && f.order === 'ASCENDING')))

for (const name of ['profileEmailPreferences', 'profileEmailNotification', 'profileEmailRetry', 'profileEmailAction']) {
  check(`Isolated function: ${name}`,
    inspect(['functions', 'describe', name, '--gen2', `--region=${region}`], 'json(serviceConfig.serviceAccountEmail)'),
    (value) => value.serviceConfig?.serviceAccountEmail === runtime,
    'Identity only; this check does not prove deployment configuration or delivery.')
}

const ready = checks.every((item) => item.state === 'ready')
const lines = ['## Profile email: read-only infrastructure preflight', '',
  'No secret payloads, user documents, IAM changes, deployment or mail sending.', '',
  '| Check | State |', '| --- | --- |', ...checks.map((item) => `| ${item.name} | ${item.state} |`), '',
  'An unreadable item is not proof of absence. An enabled secret version is not a key-validity check.',
  'Resource presence does not verify all deployment, build, trigger or invocation permissions.',
  'Actual recipient, provider acceptance and receipt still require a separate end-to-end test.', '',
  ready ? 'Listed prerequisites are present; sending has not been enabled.' : 'Setup is incomplete or cannot be verified; no sending or deployment attempted.', '']
console.log(JSON.stringify({ project, region, ready, checks }, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'))
if (!ready) process.exitCode = 1
