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
    expect(workflow).toContain("inputs.operation == 'activate' && inputs.confirmation == 'ENABLE_MOVIEHUB_TV_FINAL_1MIN'")
    expect(workflow).toMatch(/firebase-tools deploy --only functions:tv-final-reminders/)
    expect(workflow).toContain('environment: production-tv-final-reminders')
    expect(nightly).toMatch(/firebase-tools deploy --only hosting,firestore:rules/)
    expect(nightly).not.toMatch(/--only functions:/)
  })

  it('uses a separate codebase and a dedicated runtime identity in Frankfurt', () => {
    expect(firebase.functions.codebase).toBe('tv-final-reminders')
    expect(firebase.functions.source).toBe('functions')
    expect(firebase.functions.predeploy).toContain('node scripts/prepare-tv-final-function.mjs')
    expect(handler).toContain("schedule: '* * * * *'")
    expect(handler).toContain("region: 'europe-west3'")
    expect(handler).toContain("concurrency: 1")
    expect(handler).toContain("maxInstances: 1")
    expect(handler).toContain('movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com')
  })

  it('prepares source modules for a self-contained Cloud Functions package', () => {
    expect(prepare).toContain('scripts/check-tv-final-reminders.mjs')
    expect(prepare).toContain('src/notifications/titleAlertModel.js')
    expect(prepare).toContain('src/notifications/titleAlertLifecycleModel.js')
    expect(prepare).toContain('src/notifications/tvFinalReminderModel.js')
    expect(handler).toContain("from './scripts/check-tv-final-reminders.mjs'")
    expect(read('functions/package.json')).toContain('"node": "22"')
  })

  it('does not schedule a job in the normal build or index definition', () => {
    const indexes = JSON.parse(read('firestore.indexes.json'))
    expect(indexes.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionGroup: 'notifications', queryScope: 'COLLECTION_GROUP' }),
    ]))
    expect(read('scripts/check-tv-final-reminders.mjs')).not.toContain('waipu:sync')
    expect(read('scripts/check-tv-final-reminders.mjs')).not.toContain('joyn:catalog')
  })
})
