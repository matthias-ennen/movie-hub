import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { isValidEmailAddress, normalizeEmailAddress } from '../src/notifications/profileEmailModel.js'
import { recipientFingerprint } from '../server/email/transport.mjs'
import { emailActionPage } from '../server/email/http.mjs'
import { builder, checkEmailFunction, checkPrivateService, disabledEnv, emailDeploymentArgs,
  events, gcloud, names, number, project, region, runtime, secrets } from './prepare-profile-email-deploy.mjs'

export const scheduler = `movie-hub-email-scheduler@${project}.iam.gserviceaccount.com`
export const jobName = 'movie-hub-email-retry-1min'
export const jobPath = `projects/${project}/locations/${region}/jobs/${jobName}`
const require = (condition, message) => { if (!condition) throw Error(message) }
const bound = (policy, member) => policy?.bindings?.some((b) => b.role === 'roles/run.invoker'
  && !b.condition && b.members?.includes(member))

function sameRetryTarget(actual, expected) {
  // Cloud Scheduler adds '/' to a bare service origin. Accept only those two
  // spellings of this exact HTTPS Cloud Run root, never paths/query/credentials.
  try {
    const url = new URL(expected)
    return url.protocol === 'https:' && url.hostname.endsWith('.run.app')
      && !url.port && [url.origin, `${url.origin}/`].includes(expected)
      && [url.origin, `${url.origin}/`].includes(actual)
  } catch { return false }
}

export function checkTestAccess(policy, service, name) {
  // Only the token action page may have exactly this public invocation binding.
  const rest = { ...policy, bindings: (policy?.bindings || []).map((binding) => ({ ...binding,
    members: binding.members?.filter((member) => !(name === 'profileEmailAction'
      && member === 'allUsers' && binding.role === 'roles/run.invoker' && !binding.condition)),
  })) }
  require(policy && Array.isArray(policy.bindings ?? []), 'Service IAM unavailable.')
  checkPrivateService(rest, service)
  if (name !== 'profileEmailAction') require(bound(policy, `serviceAccount:${name === 'profileEmailRetry' ? scheduler : events}`),
    'Required dedicated service invocation grant is missing.')
}

export function checkRetryJob(job, uri) {
  const target = job?.httpTarget
  require(job?.name === jobPath && ['ENABLED', 'PAUSED'].includes(job.state)
    && job.schedule === '* * * * *' && ['Etc/UTC', 'UTC'].includes(job.timeZone)
    && job.attemptDeadline === '120s' && (job.retryConfig?.retryCount ?? 0) === 0
    && ['0s', undefined].includes(job.retryConfig?.maxRetryDuration)
    && sameRetryTarget(target?.uri, uri) && target.httpMethod === 'POST' && !target.oauthToken
    && target.oidcToken?.serviceAccountEmail === scheduler && target.oidcToken.audience === uri
    && target.body === 'e30=' && !job.pubsubTarget && !job.appEngineHttpTarget,
  'Existing mail scheduler differs; no replacement or deletion.')
  require(Object.entries(target.headers || {}).every(([key, value]) =>
    (key.toLowerCase() === 'content-type' && value === 'application/json') || key.toLowerCase() === 'user-agent'),
  'Unexpected scheduler headers.')
}

export async function probeAction(uri, fetchImpl = fetch, sleep = (ms) => new Promise((done) => setTimeout(done, ms))) {
  // IAM propagation/cold start may lag the successful metadata readback. Repeat
  // only inert GETs, never the IAM mutation or deployment.
  for (let attempt = 0; attempt < 7; attempt++) {
    let result
    try { result = await fetchImpl(uri, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) }) } catch {}
    if (result?.status === 200) {
      try { if (await result.text() === emailActionPage) return } catch {}
      break
    }
    if (result && ![401, 403, 503].includes(result.status)) break
    if (attempt < 6) await sleep(10000)
  }
  throw Error('Public confirmation page could not be verified; no additional activation attempted.')
}

export async function activateEmailTest({ recipient, apply = false, verifyActive = false, run = gcloud, clock = Date.now,
  writeEnv, probe = probeAction, log = console.log } = {}) {
  let stage = 'Inspect test prerequisites'
  try {
    require(!(apply && verifyActive), 'Choose activation or read-only active verification, not both.')
    const email = normalizeEmailAddress(recipient)
    require(isValidEmailAddress(email), 'Valid Resend account email required.')
    const fingerprint = recipientFingerprint(email)
    const info = run(['projects', 'describe', project], { format: 'json(projectId,projectNumber,lifecycleState)' })
    require(info?.projectId === project && String(info.projectNumber) === number && info.lifecycleState === 'ACTIVE', 'Unexpected project.')
    const db = run(['firestore', 'databases', 'describe', '--database=(default)'], { format: 'json(locationId,type)' })
    require(db?.locationId === region && db.type === 'FIRESTORE_NATIVE', 'Unexpected database/region.')
    for (const email of [runtime, builder, events, scheduler]) {
      const account = run(['iam', 'service-accounts', 'describe', email], { format: 'json(email,disabled)' })
      require(account?.email === email && account.disabled !== true, 'Dedicated mail account missing or disabled.')
    }
    const field = run(['firestore', 'indexes', 'fields', 'describe', 'queueAt',
      '--collection-group=emailDeliveries', '--database=(default)'], { format: 'json(indexConfig)' })
    require(field?.indexConfig?.indexes?.some((i) => i.state === 'READY' && i.queryScope === 'COLLECTION_GROUP'
      && i.fields?.length === 1 && i.fields[0].fieldPath === 'queueAt' && i.fields[0].order === 'ASCENDING'),
    'Mail retry index is not READY.')
    const describe = (name) => run(['functions', 'describe', name, '--gen2', `--region=${region}`])
    const original = Object.fromEntries(names.map((name) => [name, describe(name)]))
    const actionUri = original.profileEmailAction?.serviceConfig?.uri
    const starts = [...new Set(names.map((name) => original[name]?.serviceConfig?.environmentVariables?.MOVIE_HUB_EMAIL_LIVE_AFTER).filter(Boolean))]
    require(starts.length <= 1, 'Existing mail start timestamps differ.')
    const liveAfter = starts[0] || new Date(clock()).toISOString()
    require(Number.isFinite(Date.parse(liveAfter)) && Date.parse(liveAfter) <= clock(), 'Invalid existing start timestamp.')
    const env = { ...disabledEnv, MOVIE_HUB_EMAIL_ENABLED: 'true', MOVIE_HUB_EMAIL_ACTION_URL: actionUri,
      MOVIE_HUB_EMAIL_LIVE_AFTER: liveAfter, MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256: fingerprint,
      MOVIE_HUB_EMAIL_TEST_RELEASE: 'recipient-v1' }
    const versions = {}
    const targets = {}
    const access = (name) => {
      const serviceName = targets[name].runService
      const policy = run(['run', 'services', 'get-iam-policy', serviceName, `--region=${region}`])
      const service = run(['run', 'services', 'describe', serviceName, `--region=${region}`])
      checkTestAccess(policy, service, name)
      return policy
    }
    // Inspect every function and its existing access before any mutation. Resume
    // only the same recipient/start configuration; never reset a live start date.
    for (const name of names) {
      const value = original[name]?.serviceConfig?.environmentVariables
      const legacy = Object.entries(disabledEnv).every(([key, expected]) => value?.[key] === expected)
      require(legacy || ['true', 'false'].includes(value?.MOVIE_HUB_EMAIL_ENABLED), 'Unexpected enabled state.')
      require(!verifyActive || value?.MOVIE_HUB_EMAIL_ENABLED === 'true', 'Test sending is not enabled on every mail function.')
      targets[name] = checkEmailFunction(original[name], name, { expectedEnv: verifyActive ? env : legacy ? disabledEnv :
        { ...env, MOVIE_HUB_EMAIL_ENABLED: value.MOVIE_HUB_EMAIL_ENABLED } })
      access(name)
      for (const ref of original[name].serviceConfig.secretEnvironmentVariables) {
        require(!versions[ref.key] || versions[ref.key] === ref.version, 'Pinned secret versions differ.')
        versions[ref.key] = ref.version
      }
    }
    for (const key of secrets) {
      const metadata = run(['secrets', 'versions', 'describe', versions[key], `--secret=${key}`], { format: 'json(name,state)' })
      require(metadata?.state === 'ENABLED' && [project, number].some((id) =>
        metadata.name === `projects/${id}/secrets/${key}/versions/${versions[key]}`), 'Pinned secret is not enabled.')
    }
    const retryUri = targets.profileEmailRetry.uri
    const inventory = () => {
      const jobs = run(['scheduler', 'jobs', 'list', `--location=${region}`])
      require(Array.isArray(jobs), 'Scheduler inventory unreadable.')
      const mailJobs = jobs.filter((job) => /(?:movie-hub-email|profileemail)/i.test(`${job.name || ''} ${job.httpTarget?.uri || ''}`)
        || sameRetryTarget(job.httpTarget?.uri, retryUri))
      require(mailJobs.length <= 1 && mailJobs.every((job) => job.name === jobPath), 'Conflicting mail scheduler exists.')
      if (mailJobs[0]) checkRetryJob(mailJobs[0], retryUri)
      return mailJobs[0]
    }
    let job = inventory()
    log('Voraussetzungen geprüft: vier Mailfunktionen, Aufrufrechte, Secret-Metadaten und READY-Index.')
    if (verifyActive) {
      stage = 'Verify active test configuration'
      require(job?.state === 'ENABLED', 'Retry scheduler not enabled.')
      require(bound(access('profileEmailAction'), 'allUsers'), 'Public action invocation grant not confirmed.')
      await probe(actionUri)
      log('TESTVERSAND GEPRÜFT: vier aktive Testfunktionen, öffentliche Aktionsseite und privater Minutenjob bestätigt.')
      log('Nur gelesen; keine Cloud-Einstellungen geändert. Tatsächlichen E-Mail-Empfang separat prüfen.')
      return { active: true, verified: true, liveAfter, actionUri, retryUri }
    }
    if (!apply) { log('NUR PRÜFUNG. Keine Aktivierung oder E-Mail.'); return { active: false } }
    require(typeof writeEnv === 'function', 'Temporary configuration writer missing.')
    const envFile = writeEnv(env)
    // Action and retry are ready first; document-triggered sending is activated last.
    for (const name of names) {
      stage = `Activate ${name}`
      log(`${name}: begrenzten Testversand bereitstellen und rückprüfen …`)
      run(emailDeploymentArgs(name, { envFile, versions, existing: true }), { format: 'none', timeout: 15 * 60 * 1000 })
      const target = checkEmailFunction(describe(name), name, { versions, expectedEnv: env })
      require(target.uri === targets[name].uri, 'Service URL changed during activation.')
      const policy = access(name)
      if (name === 'profileEmailAction') {
        if (!bound(policy, 'allUsers')) run(['run', 'services', 'add-iam-policy-binding', target.runService,
          `--region=${region}`, '--member=allUsers', '--role=roles/run.invoker', '--condition=None'], { format: 'none' })
        require(bound(access(name), 'allUsers'), 'Public action invocation grant not confirmed.')
        await probe(target.uri)
        log('Bestätigungs-/Abmeldeseite öffentlich geprüft (GET ohne Zustandsänderung).')
      }
    }
    stage = 'Configure private retry scheduler'
    job = inventory()
    if (!job) {
      run(['scheduler', 'jobs', 'create', 'http', jobName, `--location=${region}`,
        '--schedule=* * * * *', '--time-zone=Etc/UTC', `--uri=${retryUri}`, '--http-method=POST',
        `--oidc-service-account-email=${scheduler}`, `--oidc-token-audience=${retryUri}`,
        '--headers=Content-Type=application/json', '--message-body={}', '--attempt-deadline=120s',
        '--max-retry-attempts=0', '--max-retry-duration=0s'], { format: 'none' })
    } else if (job.state === 'PAUSED') run(['scheduler', 'jobs', 'resume', jobName, `--location=${region}`], { format: 'none' })
    const finalJob = inventory()
    require(finalJob?.state === 'ENABLED', 'Retry scheduler not enabled.')
    for (const name of names) {
      checkEmailFunction(describe(name), name, { versions, expectedEnv: env })
      access(name)
    }
    log('TESTVERSAND AKTIV: auf die eingegebene Resend-Kontoadresse begrenzt. Minutenjob eingerichtet.')
    log('Jetzt die E-Mail-Einstellungen dieses Profils in MovieHub erneut speichern. Tatsächlichen Empfang anschließend prüfen.')
    return { active: true, liveAfter, actionUri, retryUri }
  } catch (error) {
    // All messages above/the SDK boundary are fixed; do not expose addresses or responses.
    throw Error(`${stage}: ${error.message}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = mkdtempSync(resolve(tmpdir(), 'moviehub-mail-test-'))
  let input
  try {
    require(process.argv.slice(2).every((arg) => ['--apply', '--verify-active'].includes(arg)), 'Unknown argument.')
    require(!(process.argv.includes('--apply') && process.argv.includes('--verify-active')), 'Choose one mode.')
    require(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22 oder neuer erforderlich.')
    require(!process.env.GITHUB_ACTIONS, 'Nur in der Cloud Shell des Projektbesitzers ausführen.')
    process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
    input = createInterface({ input: process.stdin, output: process.stdout })
    const recipient = await input.question('E-Mail-Adresse deines Resend-Kontos: ')
    input.close()
    if (process.argv.includes('--apply')) await import('./prepare-email-function.mjs')
    await activateEmailTest({ recipient, apply: process.argv.includes('--apply'), verifyActive: process.argv.includes('--verify-active'),
      writeEnv: (env) => { const path = resolve(dir, 'test-env.json'); writeFileSync(path, JSON.stringify(env), { mode: 0o600 }); return path } })
  } catch (error) {
    console.error(error.message)
    console.error(process.argv.includes('--apply')
      ? 'Bei Abbruch können einzelne Testfunktionen bereits aktiv sein. Derselbe Befehl setzt mit derselben Adresse und Startzeit fort.'
      : 'Prüfung abgebrochen; keine Cloud-Einstellungen verändert.')
    process.exitCode = 1
  } finally { input?.close(); rmSync(dir, { recursive: true, force: true }) }
}
