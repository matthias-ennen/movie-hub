import { pathToFileURL } from 'node:url'
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { runTitleAlertCheck } from './check-title-alerts.mjs'
import { alertNotificationId, watchId } from '../src/notifications/titleAlertModel.js'

const TARGET = 'movie-121-included' // Der Herr der Ringe – Die zwei Türme (TMDB 121)

/**
 * A deliberately scoped, count-only production acceptance check.
 * It never logs identities, profile names, activation IDs, title text or tokens.
 * It writes only via the normal watch evaluator, not synthetic notifications.
 */
export async function inspectTarget(db, target = TARGET) {
  const users = await db.collection('users').get()
  const matches = []
  for (const user of users.docs) {
    const profiles = await user.ref.collection('profiles').get()
    for (const profile of profiles.docs) {
      const watchSnapshot = await profile.ref.collection('titleAlerts').doc(target).get()
      if (!watchSnapshot.exists) continue
      const watch = watchSnapshot.data()
      if (![1, 2].includes(watch?.schemaVersion) || watchId(watch, watch.kind) !== target
        || !/^[a-zA-Z0-9-]{1,80}$/.test(watch.activationId || '')) continue

      const state = await profile.ref.collection('titleAlertState').doc(target).get()
      const initialId = alertNotificationId(watch, 'initial')
      const initialNotification = initialId
        ? await profile.ref.collection('notifications').doc(initialId).get() : null
      matches.push({
        stateRecorded: state.exists && state.data()?.activationId === watch.activationId,
        includedNow: state.exists && state.data()?.activationId === watch.activationId
          && state.data()?.available === true,
        initialNotificationPresent: Boolean(initialNotification?.exists),
      })
    }
  }
  return matches
}

export function verifyCheckResults(first, second, states) {
  if (first.observed < 1 || ![0, first.observed].includes(second.observed)
    || states.length !== first.observed) {
    throw new Error('Target watch not consistently found in Firestore.')
  }
  if (first.failed || second.failed || second.includedCreated !== 0 || second.tvCreated !== 0) {
    throw new Error('Repeated title-alert check was not idempotent.')
  }
  if (!states.every((state) => state.stateRecorded)) {
    throw new Error('Target watch was not persisted to titleAlertState.')
  }
  if (first.includedCreated > 0 && !states.some((state) => state.initialNotificationPresent)) {
    throw new Error('A newly created notification cannot be read back.')
  }
  return {
    observed: first.observed,
    initialCreated: first.includedCreated,
    repeatCreated: second.includedCreated,
    statesPersisted: states.filter((state) => state.stateRecorded).length,
    currentlyIncluded: states.filter((state) => state.includedNow).length,
    initialEventsPresent: states.filter((state) => state.initialNotificationPresent).length,
    deduplication: 'passed',
  }
}

async function main() {
  const token = process.env.TMDB_API_READ_TOKEN
  if (!token) throw new Error('TMDB_API_READ_TOKEN is required.')
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'movie-hub-62459',
  }, 'target-title-alert-e2e')
  try {
    const db = getFirestore(app)
    // No TV import or index needed for the chosen included-watch.
    const options = { db, token, onlyWatchId: TARGET, tvTitles: new Map() }
    const first = await runTitleAlertCheck(options)
    if (first.observed === 0) throw new Error('The activated target watch is not present in Firestore.')
    const second = await runTitleAlertCheck(options)
    const states = await inspectTarget(db)
    console.log(JSON.stringify(verifyCheckResults(first, second, states)))
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
