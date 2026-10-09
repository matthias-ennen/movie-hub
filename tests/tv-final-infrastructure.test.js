import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const firebase = JSON.parse(read('firebase.json'))
const workflow = read('.github/workflows/tv-final-infrastructure.yml')
const nightly = read('.github/workflows/deploy-firebase.yml')
const handler = read('functions/index.mjs')
const prepare = read('scripts/prepare-tv-final-function.mjs')

describe('#382 isolated Cloud Scheduler rollout contract', () => {
  it('is activated only from a separately confirmed manual workflow', () => {
    expect(workflow).toMatch(/workflow_dispatch:/)
    expect(workflow).not.toMatch(/\n  schedule:/)
    expect(workflow).not.toMatch(/\n  push:/)
    expect(workflow).toContain("github.ref == 'refs/heads/main' && inputs.operation == 'activate' && inputs.confirmation == 'ENABLE_MOVIEHUB_TV_FINAL_1MIN'")
    expect(workflow).not.toMatch(/firebase-tools deploy --only functions:tv-final-reminders/)
    expect(workflow).toContain("inputs.operation == 'prepare'")
    expect(workflow).toContain('gcloud functions deploy movieHubTvFinalReminder --gen2')
    expect(workflow).toContain('--build-service-account=projects/movie-hub-62459/serviceAccounts/movie-hub-tv-build@')
    expect(workflow).toContain('--no-allow-unauthenticated')
    expect(workflow).toContain('roles/run.invoker')
    expect(workflow).toContain('--oidc-service-account-email=movie-hub-tv-scheduler@')
    expect(workflow).toContain('--max-retry-attempts=0')
    expect(workflow).toContain('environment: production-tv-final-reminders')
    expect(nightly).toMatch(/firebase-tools deploy --only hosting,firestore:rules/)
    expect(nightly).not.toMatch(/--only functions:/)
  })

  it('treats the manual preflight as a read-only release gate, not a decorative report', () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main' && inputs.operation == 'preflight'")
    for (const command of [
      'gcloud services list --enabled',
      'gcloud iam service-accounts describe',
      'gcloud iam roles describe MovieHubTvFinalRuntime',
      'gcloud billing projects describe',
      'gcloud scheduler jobs list',
    ]) expect(workflow).toContain(command)
    for (const api of [
      'cloudfunctions.googleapis.com',
      'cloudscheduler.googleapis.com',
      'run.googleapis.com',
      'cloudbuild.googleapis.com',
      'artifactregistry.googleapis.com',
      'eventarc.googleapis.com',
      'firestore.googleapis.com',
    ]) expect(workflow).toContain(api)
    expect(workflow).toContain('Infrastructure preflight failed; no activation was attempted.')
    expect(workflow).toMatch(/if \[ "\$failed" -ne 0 \]; then[\s\S]*?exit 1/)
    const beforeActivate = workflow.split('\n  prepare:')[0]
    expect(beforeActivate).not.toMatch(/gcloud services enable|gcloud iam service-accounts create|firebase-tools deploy/)
    expect(beforeActivate).not.toContain('|| true')
  })

  it('refuses to overwrite live TV scheduling during prepare and checks private IAM first', () => {
    const prep = workflow.split('\n  prepare:')[1]?.split('\n  activate:')[0]
    const activation = workflow.split('\n  activate:')[1]
    expect(prep).toContain('Refuse prepare if a TV minute scheduler already exists')
    expect(prep).toContain('TV minute scheduler already exists: refusing to redeploy')
    expect(prep).toContain('gcloud scheduler jobs list')
    expect(activation).toContain('Refuse activation if the existing Cloud Run service is publicly callable')
    expect(activation).toContain('Cannot activate a publicly callable TV function')
    expect(activation).toContain('gcloud run services describe')
    expect(activation).toContain('invokerIamDisabled')
    expect(activation).toContain('run.googleapis.com/invoker-iam-disabled')
    expect(activation.indexOf('Refuse activation if the existing Cloud Run service is publicly callable'))
      .toBeLessThan(activation.indexOf('Grant one scheduler identity invocation on only this private service'))
  })

  it('uses a separate codebase and a dedicated runtime identity in Frankfurt', () => {
    expect(firebase.functions.codebase).toBe('tv-final-reminders')
    expect(firebase.functions.source).toBe('functions')
    expect(firebase.functions.predeploy).toContain('node scripts/prepare-tv-final-function.mjs')
    expect(handler).not.toContain('onSchedule')
    expect(handler).toContain('createTvFinalHttpHandler')
    expect(workflow).toContain('--region=europe-west3')
    expect(workflow).toContain('--concurrency=1')
    expect(workflow).toContain('--max-instances=1')
    expect(workflow).toContain("--schedule='* * * * *'")
    expect(workflow).toContain('movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com')
  })

  it('prepares source modules for a self-contained Cloud Functions package', () => {
    expect(prepare).toContain('scripts/check-tv-final-reminders.mjs')
    expect(prepare).toContain('src/notifications/titleAlertModel.js')
    expect(prepare).toContain('src/notifications/titleAlertLifecycleModel.js')
    expect(prepare).toContain('src/notifications/tvFinalReminderModel.js')
    expect(handler).toContain("from './scripts/check-tv-final-reminders.mjs'")
    const gcloudIgnoreEntries = read('functions/.gcloudignore').split('\n')
      .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    expect(gcloudIgnoreEntries).not.toContain('scripts/')
    expect(gcloudIgnoreEntries).not.toContain('src/')
    expect(read('functions/package.json')).toContain('"node": "22"')
  })

  it('does not schedule a job in the normal build or index definition', () => {
    const indexes = JSON.parse(read('firestore.indexes.json'))
    expect(indexes.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collectionGroup: 'notifications', queryScope: 'COLLECTION_GROUP',
        fields: expect.arrayContaining([
          expect.objectContaining({ fieldPath: 'phase' }),
          expect.objectContaining({ fieldPath: 'scheduleStatus' }),
          expect.objectContaining({ fieldPath: 'airingStartAt' }),
        ]),
      }),
    ]))
    expect(read('scripts/check-tv-final-reminders.mjs')).not.toContain('waipu:sync')
    expect(read('scripts/check-tv-final-reminders.mjs')).not.toContain('joyn:catalog')
  })
})
