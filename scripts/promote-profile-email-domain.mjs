import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRetryJob, checkTestAccess, jobPath, probeAction, scheduler } from './activate-profile-email-test.mjs'
import { builder, checkEmailFunction, emailDeploymentArgs, events, gcloud, names, number,
  project, region, runtime } from './prepare-profile-email-deploy.mjs'

export const productionFrom = 'MovieHub <mitteilungen@mail.moviehubgermany.de>'
const provisionalFrom = 'MovieHub <onboarding@resend.dev>'
const transitionOrder = ['profileEmailPreferences', 'profileEmailNotification', 'profileEmailRetry', 'profileEmailAction']
const need = (ok, message) => { if (!ok) throw Error(message) }
const record = (functionInfo) => functionInfo?.serviceConfig?.environmentVariables
const keyVersion = (details, key) => details?.serviceConfig?.secretEnvironmentVariables?.find((v) =>
  v.key === key && v.secret === key && (!v.projectId || [project, number].includes(String(v.projectId))))?.version
const activeSender = (details, target) => record(details)?.MOVIE_HUB_EMAIL_FROM === productionFrom
  && keyVersion(details, 'RESEND_API_KEY') === target
  && !Object.keys(record(details) || {}).some((key) => key.startsWith('MOVIE_HUB_EMAIL_TEST_'))
const noAnonymous = (policy, service, name) => {
  checkTestAccess(policy, service, name)
  need(name !== 'profileEmailAction' || policy.bindings.some((b) =>
    b.role === 'roles/run.invoker' && !b.condition && b.members?.includes('allUsers')),
  'The existing token action page must remain publicly callable.')
}

export async function promoteEmailDomain({ run = gcloud, newKeyVersion, apply = false, quietQueue,
  writeEnv, probe = probeAction, log = console.log, clock = Date.now } = {}) {
  let stage = 'Inspect production cutover'
  try {
    need(/^[1-9][0-9]*$/.test(String(newKeyVersion)), 'An explicit numeric Resend secret version is required.')
    const version = String(newKeyVersion)
    const identity = run(['projects', 'describe', project], { format: 'json(projectId,projectNumber,lifecycleState)' })
    need(identity?.projectId === project && String(identity.projectNumber) === number && identity.lifecycleState === 'ACTIVE', 'Unexpected project.')
    const database = run(['firestore', 'databases', 'describe', '--database=(default)'], { format: 'json(locationId,type)' })
    need(database?.locationId === region && database.type === 'FIRESTORE_NATIVE', 'Unexpected database.')
    for (const email of [runtime, builder, events, scheduler]) {
      const account = run(['iam', 'service-accounts', 'describe', email], { format: 'json(email,disabled)' })
      need(account?.email === email && account.disabled !== true, 'Mail identity missing or disabled.')
    }
    const index = run(['firestore', 'indexes', 'fields', 'describe', 'queueAt',
      '--collection-group=emailDeliveries', '--database=(default)'], { format: 'json(indexConfig)' })
    need(index?.indexConfig?.indexes?.some((i) => i.state === 'READY'
      && i.queryScope === 'COLLECTION_GROUP' && i.fields?.length === 1
      && i.fields[0].fieldPath === 'queueAt' && i.fields[0].order === 'ASCENDING'), 'Retry index is not ready.')
    const describe = (name) => run(['functions', 'describe', name, '--gen2', `--region=${region}`])
    const current = Object.fromEntries(names.map((name) => [name, describe(name)]))
    const first = current[names[0]]
    const start = record(first)?.MOVIE_HUB_EMAIL_LIVE_AFTER
    need(start && Number.isFinite(Date.parse(start)) && Date.parse(start) <= clock(), 'Historical sending start is missing or in the future.')
    const tokenVersion = keyVersion(first, 'MOVIE_HUB_EMAIL_TOKEN_KEY')
    need(/^[1-9][0-9]*$/.test(tokenVersion || ''), 'Pinned signing key version missing.')
    const actionUrl = current.profileEmailAction?.serviceConfig?.uri
    const retryUrl = current.profileEmailRetry?.serviceConfig?.uri
    const oldKeys = new Set()
    const states = {}
    const expectedEnv = {}
    const inspectIam = (name) => {
      const runName = name.toLowerCase()
      const policy = run(['run', 'services', 'get-iam-policy', runName, `--region=${region}`])
      const service = run(['run', 'services', 'describe', runName, `--region=${region}`])
      noAnonymous(policy, service, name)
    }
    for (const name of names) {
      const info = current[name]
      const env = record(info)
      need(env?.MOVIE_HUB_EMAIL_ENABLED === 'true'
        && [provisionalFrom, productionFrom].includes(env.MOVIE_HUB_EMAIL_FROM)
        && env.MOVIE_HUB_EMAIL_LIVE_AFTER === start
        && env.MOVIE_HUB_EMAIL_ACTION_URL === actionUrl
        && keyVersion(info, 'MOVIE_HUB_EMAIL_TOKEN_KEY') === tokenVersion,
      'Existing mail setup differs: no automatic migration.')
      need(name !== 'profileEmailRetry' || info.serviceConfig.uri === retryUrl, 'Retry target changed.')
      need(name !== 'profileEmailAction' || info.serviceConfig.uri === actionUrl, 'Action target changed.')
      const live = activeSender(info, version)
      if (!live) {
        need(env.MOVIE_HUB_EMAIL_FROM === provisionalFrom
          && /^[a-f0-9]{64}$/.test(env.MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256 || '')
          && env.MOVIE_HUB_EMAIL_TEST_RELEASE === 'recipient-v1'
          && keyVersion(info, 'RESEND_API_KEY') !== version,
        'Unexpected mixed or unbounded previous configuration.')
        oldKeys.add(keyVersion(info, 'RESEND_API_KEY'))
      }
      const expected = { ...env }
      delete expected.MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256
      delete expected.MOVIE_HUB_EMAIL_TEST_RELEASE
      expected.MOVIE_HUB_EMAIL_FROM = productionFrom
      expectedEnv[name] = expected
      checkEmailFunction(info, name, { expectedEnv: env })
      inspectIam(name)
      states[name] = live ? 'production' : 'provisional'
    }
    need(oldKeys.size <= 1, 'Existing Resend secret versions disagree.')
    for (const [secret, pin] of [['MOVIE_HUB_EMAIL_TOKEN_KEY', tokenVersion], ['RESEND_API_KEY', version]]) {
      const meta = run(['secrets', 'versions', 'describe', pin, `--secret=${secret}`], { format: 'json(name,state)' })
      need(meta?.state === 'ENABLED' && [project, number].some((id) =>
        meta.name === `projects/${id}/secrets/${secret}/versions/${pin}`), 'Required secret version is not enabled.')
    }
    const jobs = run(['scheduler', 'jobs', 'list', `--location=${region}`])
    need(Array.isArray(jobs), 'Cannot inspect retry schedules.')
    const mailJobs = jobs.filter((j) => /(?:movie-hub-email|profileemail)/i.test(`${j.name || ''} ${j.httpTarget?.uri || ''}`))
    need(mailJobs.length === 1 && mailJobs[0].name === jobPath, 'Mail scheduler is missing or duplicated.')
    checkRetryJob(mailJobs[0], retryUrl)
    await probe(actionUrl)
    log(`Production preflight: ${Object.values(states).filter((s) => s === 'production').length}/4 functions switched; secret version inspected; sender ${productionFrom}.`)
    if (!apply) { log('NUR PRÜFUNG: kein Cloud-Deploy, keine Scheduler-Änderung.'); return { states, ready: true } }
    need(typeof quietQueue === 'function' && typeof writeEnv === 'function', 'Queue and configuration guards are required.')
    stage = 'Check old delivery queue'
    need(await quietQueue(), 'An attempted delivery still uses an older sender; allow retry to finish before cutover.')
    stage = 'Pause only the private email retry scheduler'
    if (mailJobs[0].state === 'ENABLED') run(['scheduler', 'jobs', 'pause', 'movie-hub-email-retry-1min',
      `--location=${region}`], { format: 'none' })
    const paused = run(['scheduler', 'jobs', 'describe', 'movie-hub-email-retry-1min',
      `--location=${region}`])
    checkRetryJob(paused, retryUrl)
    need(paused.state === 'PAUSED', 'Retry scheduler did not pause; no deploy.')
    // Event handlers continue to deliver fresh profile events directly. Pausing
    // the retry worker prevents mixed-sender retries during this bounded cutover.
    for (const name of transitionOrder) {
      if (states[name] === 'production') continue
      stage = `Promote ${name}`
      need(await quietQueue(), 'An attempted delivery still uses the former sender; retry job remains paused for inspection.')
      const configPath = writeEnv(name, expectedEnv[name])
      run(emailDeploymentArgs(name, { envFile: configPath, versions: {
        RESEND_API_KEY: version, MOVIE_HUB_EMAIL_TOKEN_KEY: tokenVersion,
      }, existing: true }), { format: 'none', timeout: 15 * 60 * 1000 })
      const checked = checkEmailFunction(describe(name), name, { versions: {
        RESEND_API_KEY: version, MOVIE_HUB_EMAIL_TOKEN_KEY: tokenVersion,
      }, expectedEnv: expectedEnv[name] })
      need(checked.uri === current[name].serviceConfig.uri, 'Function endpoint changed unexpectedly.')
      inspectIam(name)
      log(`${name}: production sender and pinned API secret checked.`)
    }
    stage = 'Verify all four functions and resume existing scheduler'
    for (const name of names) {
      const checked = checkEmailFunction(describe(name), name, { versions: {
        RESEND_API_KEY: version, MOVIE_HUB_EMAIL_TOKEN_KEY: tokenVersion,
      }, expectedEnv: expectedEnv[name] })
      need(checked.uri === current[name].serviceConfig.uri, 'Function endpoint changed unexpectedly.')
      inspectIam(name)
    }
    await probe(actionUrl)
    need(await quietQueue(), 'An attempted delivery still uses the former sender; retry scheduler remains paused for inspection.')
    const beforeResume = run(['scheduler', 'jobs', 'describe', 'movie-hub-email-retry-1min',
      `--location=${region}`])
    checkRetryJob(beforeResume, retryUrl)
    need(beforeResume.state === 'PAUSED', 'Unexpected scheduler state before resuming.')
    run(['scheduler', 'jobs', 'resume', 'movie-hub-email-retry-1min',
      `--location=${region}`], { format: 'none' })
    const resumed = run(['scheduler', 'jobs', 'describe', 'movie-hub-email-retry-1min',
      `--location=${region}`])
    checkRetryJob(resumed, retryUrl)
    need(resumed.state === 'ENABLED', 'Retry scheduler was not resumed.')
    log('PRODUKTIVER MAILVERSAND AKTIV: 4/4 Funktionen, eigener Absender, Secret-Version und privater Minutenjob geprüft.')
    log('Keine Test-Empfängerbegrenzung mehr; Versand nur gemäß bestätigten Profil-Einwilligungen. Echten Versand separat testen.')
    return { states: Object.fromEntries(names.map((name) => [name, 'production'])), ready: true, active: true }
  } catch (error) { throw Error(`${stage}: ${error.message}`) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const version = args.find((x) => /^--key-version=[1-9][0-9]*$/.test(x))?.split('=')[1]
  const tmp = mkdtempSync(resolve(tmpdir(), 'moviehub-mail-production-'))
  try {
    need(args.every((arg) => arg === '--apply' || /^--key-version=[1-9][0-9]*$/.test(arg))
      && args.filter((arg) => arg.startsWith('--key-version=')).length === 1
      && args.filter((arg) => arg === '--apply').length <= 1, 'Usage: node scripts/promote-profile-email-domain.mjs [--apply] --key-version=N')
    need(Number(process.versions.node.split('.')[0]) >= 22 && !process.env.GITHUB_ACTIONS,
      'Cloud Shell with Node.js 22 or later required.')
    process.chdir(resolve(fileURLToPath(new URL('..', import.meta.url))))
    let db
    const quietQueue = async () => {
      if (!db) {
        const admin = await import('firebase-admin/app')
        const firestore = await import('firebase-admin/firestore')
        if (!admin.getApps().length) admin.initializeApp({ projectId: project })
        db = firestore.getFirestore()
      }
      const snap = await db.collectionGroup('emailDeliveries').where('queueAt', '>=',
        new Date(0)).orderBy('queueAt').limit(500).select('sender').get()
      // An attempted old-sender job cannot safely be resent using the new
      // domain-limited key. Unattempted and new-sender jobs may proceed.
      return snap.size < 500 && snap.docs.every((doc) => {
        const sender = doc.get('sender')
        return !sender || sender === productionFrom
      })
    }
    if (apply) await import('./prepare-email-function.mjs')
    await promoteEmailDomain({ newKeyVersion: version, apply, quietQueue, writeEnv: (name, env) => {
      const path = resolve(tmp, `${name}.json`)
      writeFileSync(path, JSON.stringify(env), { mode: 0o600 })
      return path
    } })
  } catch (error) {
    console.error(error.message)
    console.error('Bei einem Teilabbruch kann der private Mail-Minutenjob PAUSED bleiben. Kein Prepare/alter Testaktivierer ausführen; Zustand lesen und denselben geprüften Cutover fortsetzen.')
    process.exitCode = 1
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}
