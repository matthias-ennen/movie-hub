import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { runTvFinalReminderCheck } from './scripts/check-tv-final-reminders.mjs'
import { createTvFinalHttpHandler } from './tv-final-http.mjs'

// Cloud Functions Gen2 private HTTP entry. The minute scheduler is provisioned
// separately and ONLY after manual production approval. Never expose publicly.
if (!getApps().length) initializeApp()
export const movieHubTvFinalReminder = createTvFinalHttpHandler({
  getDb: () => getFirestore(),
  run: runTvFinalReminderCheck,
})
