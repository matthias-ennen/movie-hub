import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const project = 'movie-hub-62459'
export const number = '612913221205'
export const region = 'europe-west3'
export const runtime = `movie-hub-email@${project}.iam.gserviceaccount.com`
export const builder = `movie-hub-email-build@${project}.iam.gserviceaccount.com`
export const events = `movie-hub-email-events@${project}.iam.gserviceaccount.com`
export const secrets = ['RESEND_API_KEY', 'MOVIE_HUB_EMAIL_TOKEN_KEY']
export const paths = {
  profileEmailPreferences: 'users/{uid}/profiles/{profileId}/emailPreferences/current',
  profileEmailNotification: 'users/{uid}/profiles/{profileId}/notifications/{eventId}',
}
export const names = ['profileEmailAction', 'profileEmailRetry', ...Object.keys(paths)]
export const disabledEnv = {
  MOVIE_HUB_EMAIL_ENABLED: 'false',
  MOVIE_HUB_EMAIL_FROM: 'MovieHub <onboarding@resend.dev>',
  MOVIE_HUB_EMAIL_LIVE_AFTER: '',
  MOVIE_HUB_EMAIL_APP_URL: 'https://movie-hub-62459.web.app',
  MOVIE_HUB_EMAIL_ACTION_URL: '',
  MOVIE_HUB_EMAIL_REGION: region,
  MOVIE_HUB_EMAIL_SERVICE_ACCOUNT: runtime,
}
const written = 'google.cloud.firestore.document.v1.written'
const require = (condition, message) => { if (!condition) throw new Error(message) }

export function gcloud(args, { missing = false, timeout = 60000, format = 'json' } = {}) {
  const result = spawnSync('gcloud', [...args, `--project=${project}`, `--format=${format}`, '--quiet'], {
    encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true' },
  })
  require(!result.error && !result.signal, 'Cloud command could not complete (command/timeout).')
  if (result.status !== 0) {
    const error = result.stderr || ''
    const denied = /PERMISSION_DENIED|permission|403|UNAUTHENTICATED|401/i.test(error)
    if (missing && !denied && /NOT_FOUND|not found|404|does not exist/i.test(error)) return null
    // Only fixed categories and permission identifiers leave this boundary.
    const permission = error.match(/(?:Permission|permission) ["']?((?:run|iam|eventarc|cloudfunctions|cloudbuild|storage|artifactregistry|secretmanager)\.[a-zA-Z.]+)/)?.[1]
    const code = denied ? 'permission-or-authentication' : /NOT_FOUND|404/i.test(error) ? 'not-found' : 'command-failed'
    throw new Error(`Cloud command failed (${code}${permission ? `: ${permission}` : ''}; exit ${result.status}).`)
  }
  if (format === 'none') return null
  try { return JSON.parse(result.stdout) } catch { throw new Error('Cloud metadata could not be parsed.') }
}

export function checkPrivateService(policy, service) {
  require(policy && Array.isArray(policy.bindings ?? []) && service, 'Cloud Run access metadata unavailable.')
  require(!(policy.bindings || []).some((binding) => binding.members?.some((member) =>
    member === 'allUsers' || member === 'allAuthenticatedUsers')), 'Refusing public Cloud Run access.')
  require(service.invokerIamDisabled !== true && service.invoker_iam_disabled !== true
    && service.metadata?.annotations?.['run.googleapis.com/invoker-iam-disabled'] !== 'true',
  'Cloud Run Invoker IAM check is disabled.')
}

export function checkEmailFunction(details, name, { before = false, versions } = {}) {
  require(names.includes(name) && details?.name === `projects/${project}/locations/${region}/functions/${name}`,
    'Unexpected mail function target.')
  require(details.environment === 'GEN_2' && (details.state === 'ACTIVE' || (before && details.state === 'FAILED')),
    'Function is not an inspectable Gen2 function.')
  const build = details.buildConfig
  const service = details.serviceConfig
  require(build?.runtime === 'nodejs22' && build.entryPoint === name
    && [project, number].some((id) => build.serviceAccount === `projects/${id}/serviceAccounts/${builder}`),
  'Unexpected function build identity/runtime/entry point.')
  require(service?.serviceAccountEmail === runtime, 'Unexpected function runtime identity.')
  require(Object.entries(disabledEnv).every(([key, value]) => service.environmentVariables?.[key] === value),
    'Refusing to overwrite an enabled or differently configured mail function.')
  require(secrets.every((key) => !(key in service.environmentVariables)), 'Secret value found in ordinary environment configuration.')
  const refs = service.secretEnvironmentVariables
  require(Array.isArray(refs) && refs.length === 2 && secrets.every((key) => refs.some((ref) =>
    ref.key === key && ref.secret === key && (!ref.projectId || [project, number].includes(String(ref.projectId)))
    && /^[1-9][0-9]*$/.test(ref.version) && (!versions || ref.version === versions[key])))
    && !service.secretVolumes?.length, 'Unexpected or unpinned secret references.')
  require(service.maxInstanceCount === 1 && (service.minInstanceCount ?? 0) === 0
    && service.maxInstanceRequestConcurrency === 1 && service.timeoutSeconds === 120
    && ['256M', '256Mi', '256MiB', '268435456'].includes(service.availableMemory), 'Mail resource limits differ.')
  if (paths[name]) {
    const trigger = details.eventTrigger
    const filters = trigger?.eventFilters
    require(trigger?.eventType === written && trigger.triggerRegion === region
      && trigger.serviceAccountEmail === events && trigger.retryPolicy === 'RETRY_POLICY_RETRY'
      && Array.isArray(filters) && filters.length === 3
      && ['database', 'namespace'].every((attribute) => filters.some((f) =>
        f.attribute === attribute && f.value === '(default)' && !f.operator))
      && filters.some((f) => f.attribute === 'document' && f.value === paths[name] && f.operator === 'match-path-pattern'),
    'Mail event trigger identity or document scope differs.')
  } else require(!details.eventTrigger, 'HTTP mail function has an unexpected event trigger.')
  // A failed first build may not have created its Cloud Run service yet.
  if (before && details.state === 'FAILED' && !service.service && !service.uri) return null
  require(service.allTrafficOnLatestRevision === true, 'Traffic is not confined to the inspected disabled revision.')
  const runService = name.toLowerCase()
  require(service.service === `projects/${project}/locations/${region}/services/${runService}`,
    'Unexpected Cloud Run service target.')
  let url
  try { url = new URL(service.uri) } catch { throw new Error('Mail service URL is missing.') }
  require(url.protocol === 'https:' && url.hostname.endsWith('.run.app') && !url.username && !url.password
    && !url.port && (service.uri === url.origin || service.uri === `${url.origin}/`), 'Unexpected mail service URL.')
  return { name, runService, uri: service.uri }
}

function checkNoMailSchedule(jobs) {
  require(Array.isArray(jobs), 'Scheduler inventory unreadable.')
  require(!jobs.some((job) => /(?:movie-hub-email|profileemail)/i.test(`${job.name || ''} ${job.httpTarget?.uri || ''}`)),
    'A mail scheduler already exists; prepare must not overwrite a scheduled service.')
}

export function prepareEmailDeployment({ run = gcloud, apply = false, envFile, log = console.log } = {}) {
  let stage = 'Inspect prerequisites'
  try {
    const info = run(['projects', 'describe', project], { format: 'json(projectId,projectNumber,lifecycleState)' })
    require(info?.projectId === project && String(info.projectNumber) === number && info.lifecycleState === 'ACTIVE', 'Unexpected project.')
    const db = run(['firestore', 'databases', 'describe', '--database=(default)'], { format: 'json(locationId,type)' })
    require(db?.locationId === region && db.type === 'FIRESTORE_NATIVE', 'Unexpected Firestore database/region.')
    for (const email of [runtime, builder, events, `movie-hub-email-scheduler@${project}.iam.gserviceaccount.com`]) {
      const account = run(['iam', 'service-accounts', 'describe', email], { format: 'json(email,disabled)' })
      require(account?.email === email && account.disabled !== true, 'Dedicated mail account missing or disabled.')
    }
    const versions = {}
    for (const key of secrets) {
      const value = run(['secrets', 'versions', 'describe', 'latest', `--secret=${key}`], { format: 'json(name,state)' })
      const match = value?.name?.match(new RegExp(`^projects/(?:${project}|${number})/secrets/${key}/versions/([1-9][0-9]*)$`))
      require(value?.state === 'ENABLED' && match, 'Latest mail secret metadata is unavailable or disabled.')
      versions[key] = match[1]
    }
    const schedules = () => run(['scheduler', 'jobs', 'list', `--location=${region}`], { format: 'json(name,httpTarget.uri)' })
    const describe = (name) => run(['functions', 'describe', name, '--gen2', `--region=${region}`], { missing: true })
    const privateService = (target) => {
      if (!target) return
      const policy = run(['run', 'services', 'get-iam-policy', target.runService, `--region=${region}`])
      const metadata = run(['run', 'services', 'describe', target.runService, `--region=${region}`])
      checkPrivateService(policy, metadata)
    }
    checkNoMailSchedule(schedules())
    // Inspect ALL existing mail targets before the first deploy. No live reset.
    for (const name of names) {
      stage = `Inspect existing ${name}`
      const existing = describe(name)
      if (existing) privateService(checkEmailFunction(existing, name, { before: true }))
    }
    if (!apply) { log('Read-only inspection complete; no deployment or sending.'); return [] }
    require(typeof envFile === 'string' && envFile.length > 0, 'Disabled environment file missing.')
    const verified = []
    for (const name of names) {
      stage = `Deploy and verify ${name}`
      log(`${stage} (sending disabled)…`)
      const args = ['functions', 'deploy', name, '--gen2', `--region=${region}`, '--runtime=nodejs22',
        '--source=email-functions', `--entry-point=${name}`, `--service-account=${runtime}`,
        `--build-service-account=projects/${project}/serviceAccounts/${builder}`,
        `--docker-repository=projects/${project}/locations/${region}/repositories/gcf-artifacts`,
        '--memory=256MiB', '--timeout=120s', '--max-instances=1', '--min-instances=0', '--concurrency=1',
        '--serve-all-traffic-latest-revision',
        `--env-vars-file=${envFile}`, `--set-secrets=${secrets.map((key) => `${key}=projects/${number}/secrets/${key}:${versions[key]}`).join(',')}`]
      if (paths[name]) args.push(`--trigger-event-filters=type=${written},database=(default),namespace=(default)`,
        `--trigger-event-filters-path-pattern=document=${paths[name]}`, `--trigger-location=${region}`,
        `--trigger-service-account=${events}`, '--retry')
      else args.push('--trigger-http', '--no-allow-unauthenticated')
      run(args, { format: 'none', timeout: 15 * 60 * 1000 })
      const target = checkEmailFunction(describe(name), name, { versions })
      privateService(target)
      verified.push(target)
    }
    checkNoMailSchedule(schedules())
    log('MAIL FUNCTIONS PREPARED: four private functions verified; sending remains disabled. No scheduler or index created.')
    return verified
  } catch (error) { throw new Error(`${stage}: ${error.message}`) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = mkdtempSync(resolve(tmpdir(), 'moviehub-mail-prepare-'))
  try {
    require(process.argv.slice(2).every((arg) => arg === '--apply'), 'Unknown argument.')
    require(!process.env.GITHUB_ACTIONS || process.env.GITHUB_REF === 'refs/heads/main', 'GitHub deployment requires main.')
    const envFile = resolve(dir, 'disabled-env.json')
    writeFileSync(envFile, JSON.stringify(disabledEnv), { mode: 0o600 })
    const verified = prepareEmailDeployment({ apply: process.argv.includes('--apply'), envFile })
    if (process.env.GITHUB_STEP_SUMMARY && verified.length) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Mail functions prepared — sending disabled\n\n| Function | Private service |\n| --- | --- |\n${verified.map((target) => `| ${target.name} | ${target.runService} |`).join('\n')}\n\nNo mail sent. Service invocation grants, retry index/job and test activation remain separate.\n`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
  finally { rmSync(dir, { recursive: true, force: true }) }
}
