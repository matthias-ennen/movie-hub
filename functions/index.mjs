import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { runTvFinalReminderCheck } from './scripts/check-tv-final-reminders.mjs'

// This export is deployed ONLY via an explicitly confirmed manual workflow.
// Deploying an onSchedule export provisions AND activates a Cloud Scheduler
// job. Never include it in the nightly hosting-only deployment.
if (!getApps().length) initializeApp()

export const movieHubTvFinalReminder = onSchedule({
  schedule: '* * * * *',
  timeZone: 'Etc/UTC',
  region: 'europe-west3',
  memory: '256MiB',
  timeoutSeconds: 60,
  maxInstances: 1,
  concurrency: 1,
  retryCount: 0,
  serviceAccount: 'movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com',
}, async () => {
  const summary = await runTvFinalReminderCheck({
    db: getFirestore(),
    now: Date.now(),
  })
  console.log('moviehub_tv_final_reminders', JSON.stringify(summary))
})
