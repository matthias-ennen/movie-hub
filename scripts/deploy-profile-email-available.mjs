import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMAIL_PHASES } from '../src/notifications/profileEmailModel.js'
import { titleNotificationEmail } from '../server/email/templates.mjs'
import { builder, checkEmailFunction, checkPrivateService, emailDeploymentArgs, events,
  gcloud, names, number, project, region, runtime } from './prepare-profile-email-deploy.mjs'

// This is a source-only hotfix for a LIVE, verified-domain Gen2 function.
// NEVER invoke the old "sending disabled" prepare workflow against production.
// A failed preflight must leave the existing mail installation untouched.
const target = 'profileEmailNotification'
const sender = 'MovieHub <mitteilungen@mail.moviehubgermany.de>'
const need = (condition, message) => { if (!condition) throw new Error(message) }
const metadata = (entry) => entry?.serviceConfig?.environmentVariables || {}
function version(entry, key) {
  return entry?.serviceConfig?.secretEnvironmentVariables?.find((v) =>
    v.key === key && v.secret === key
    && (!v.projectId || [project, number].includes(String(v.projectId))))?.version
}

function verifyMailCode() {
  need(EMAIL_PHASES.includes('available-found'), 'Source lacks new available-found phase.')
  const result = titleNotificationEmail({
    phase: 'available-found', title: 'Testfilm', profileName: 'Test',
    providerNames: ['Prime Video'], url: 'https://example.org',
    unsubscribeUrl: 'https://example.org/action',
  })
  need(result.subject.includes('Jetzt verfügbar') && result.text.includes('Prime Video'),
    'Source mail template is not ready.')
}

export function deployAvailableNotificationSource({ run = gcloud, apply = false, log = console.log } = {}) {
  verifyMailCode()
  const identity = run(['projects', 'describe', project], { format: 'json(projectId,projectNumber,lifecycleState)' })
  need(identity?.projectId === project && String(identity.projectNumber) === number
    && identity.lifecycleState === 'ACTIVE', 'Unexpected GCP project.')
  const database = run(['firestore', 'databases', 'describe', '--database=(default)'], { format: 'json(locationId,type)' })
  need(database?.locationId === region && database.type === 'FIRESTORE_NATIVE',
    'Unexpected database region/type.')
  for (const account of [runtime, builder, events]) {
    const info = run(['iam', 'service-accounts', 'describe', account], { format: 'json(email,disabled)' })
    need(info?.email === account && info.disabled !== true, 'Existing mail identity unavailable.')
  }

  const current = Object.fromEntries(names.map((name) =>
    [name, run(['functions', 'describe', name, '--gen2', `--region=${region}`])]))
  const initial = current[target]
  const initialEnv = metadata(initial)
  const apiPin = version(initial, 'RESEND_API_KEY')
  const tokenPin = version(initial, 'MOVIE_HUB_EMAIL_TOKEN_KEY')
  need(apiPin === '2' && /^[1-9][0-9]*$/.test(tokenPin || ''),
    'The verified production mail secret pins differ. Refusing update.')
  need(initialEnv.MOVIE_HUB_EMAIL_ENABLED === 'true'
    && initialEnv.MOVIE_HUB_EMAIL_FROM === sender
    && initialEnv.MOVIE_HUB_EMAIL_REGION === region
    && initialEnv.MOVIE_HUB_EMAIL_SERVICE_ACCOUNT === runtime
    && initialEnv.MOVIE_HUB_EMAIL_APP_URL?.startsWith('https://')
    && initialEnv.MOVIE_HUB_EMAIL_ACTION_URL?.startsWith('https://')
    && Number.isFinite(Date.parse(initialEnv.MOVIE_HUB_EMAIL_LIVE_AFTER))
    && Date.parse(initialEnv.MOVIE_HUB_EMAIL_LIVE_AFTER) < Date.now()
    && !Object.keys(initialEnv).some((key) => key.startsWith('MOVIE_HUB_EMAIL_TEST_')),
    'Existing production mail configuration differs. Refusing update.')
  const versions = { RESEND_API_KEY: apiPin, MOVIE_HUB_EMAIL_TOKEN_KEY: tokenPin }
  const actionUrl = current.profileEmailAction?.serviceConfig?.uri
  need(actionUrl === initialEnv.MOVIE_HUB_EMAIL_ACTION_URL, 'The verified action endpoint changed.')
  for (const name of names) {
    const item = current[name]
    need(metadata(item).MOVIE_HUB_EMAIL_FROM === sender
      && metadata(item).MOVIE_HUB_EMAIL_ENABLED === 'true'
      && version(item, 'RESEND_API_KEY') === apiPin
      && version(item, 'MOVIE_HUB_EMAIL_TOKEN_KEY') === tokenPin,
    'Existing four mail functions are not aligned.')
    checkEmailFunction(item, name, { versions, expectedEnv: metadata(item) })
  }

  const serviceName = target.toLowerCase()
  const policy = () => run(['run', 'services', 'get-iam-policy', serviceName, `--region=${region}`])
  const service = () => run(['run', 'services', 'describe', serviceName, `--region=${region}`])
  checkPrivateService(policy(), service())
  log('Mail-Update geprüft: eigene Domain, vier aktive Funktionen, sichere Secret-Versionen, privates Ziel.')
  if (!apply) {
    log('Nur Prüfung. Kein Cloud-Deploy. Für den manuellen Einzelfunktions-Deploy --apply verwenden.')
    return { ready: true, updated: false }
  }
  // The caller has already prepared email-functions/ from this exact main commit.
  const argumentsForDeployment = emailDeploymentArgs(target, {
    versions, existing: true, preserveEnv: true,
  })
  need(!argumentsForDeployment.some((value) => value.includes('--env-vars-file'))
    && !argumentsForDeployment.some((value) => /--no-allow-unauthenticated|--allow-unauthenticated/.test(value)),
  'Unsafe mail source deployment arguments.')
  run(argumentsForDeployment, { format: 'none', timeout: 15 * 60 * 1000 })
  const updated = run(['functions', 'describe', target, '--gen2', `--region=${region}`])
  checkEmailFunction(updated, target, { versions, expectedEnv: initialEnv })
  need(updated.serviceConfig.uri === initial.serviceConfig.uri,
    'Mail notification endpoint changed after deployment.')
  checkPrivateService(policy(), service())
  log('MAIL-EINZELUPDATE GEPRÜFT: nur profileEmailNotification; Absender, IAM, Secret-Pins und alle anderen Funktionen unverändert.')
  return { ready: true, updated: true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    need(args.length <= 1 && (args.length === 0 || args[0] === '--apply'), 'Unknown arguments.')
    need(!process.env.GITHUB_ACTIONS ||
      (process.env.GITHUB_REF === 'refs/heads/main'
        && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'),
    'Production mail hotfix is restricted to manual main-branch GitHub workflows.')
    deployAvailableNotificationSource({ apply: args.includes('--apply') })
  } catch (error) {
    console.error(error.message)
    console.error('Keine alte Mail-Prepare- oder Domain-Migration starten. Bei einem Fehler nur den unveränderten Produktionsstatus prüfen.')
    process.exitCode = 1
  }
}
