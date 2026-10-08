import { pathToFileURL } from 'node:url'
import { alertNotificationId, watchId } from '../src/notifications/titleAlertModel.js'
import { isActiveTitleWatch } from '../src/notifications/titleAlertLifecycleModel.js'
import { runTitleAlertCheck } from './check-title-alerts.mjs'

const WATCH_ID = 'movie-121-included' // Acceptance reference: The Two Towers (2002).

function millis(value) {
  return value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : NaN)
}

export function verifyLegacyCompletion(before, after, first, replay) {
  if (!before.active && !before.completed) throw new Error('Title watch is neither active nor completed.')
  if (first.failed || replay.failed || first.includedCreated !== 0 || replay.includedCreated !== 0
    || replay.observed !== 0 || first.observed !== (before.active ? 1 : 0)) {
    throw new Error('Scoped legacy completion or deduplication did not match expectations.')
  }
  if (!after.completed || after.notificationId !== before.notificationId
    || after.activationId !== before.activationId || after.eventPhase !== 'included-found') {
    throw new Error('Persisted terminal watch state or event phase did not match.')
  }
  if (before.body !== after.body || before.startsAt !== after.startsAt
    || before.expiresAt !== after.expiresAt
    || before.readAt !== after.readAt
    || before.notificationCount !== 1 || after.notificationCount !== 1) {
    throw new Error('Original notification, read marker, or single-event count changed.')
  }
  return { watchesMatched: 1, completed: true,
    createdNotifications: 0, replayCreatedNotifications: 0,
    originalEventPreserved: true, originalReadStatePreserved: true,
    duplicates: 0 }
}

async function locate(db) {
  const users = await db.collection('users').get()
  const found = []
  for (const user of users.docs) {
    const profiles = await user.ref.collection('profiles').get()
    for (const profile of profiles.docs) {
      const watchRef = profile.ref.collection('titleAlerts').doc(WATCH_ID)
      const watch = await watchRef.get()
      if (!watch.exists) continue
      const w = watch.data()
      if (![1, 2].includes(w?.schemaVersion)
        || watchId(w, w.kind) !== WATCH_ID
        || !/^[a-zA-Z0-9-]{1,80}$/.test(w.activationId || '')) continue
      found.push({ profileRef: profile.ref, watchRef, watchData: w })
    }
  }
  if (found.length !== 1) {
    throw new Error('Expected exactly one existing acceptance watch. No data was modified.')
  }
  return found[0]
}

async function inspect(found, { originalId, activationId }) {
  const watch = await found.watchRef.get()
  const eventRef = found.profileRef.collection('notifications').doc(originalId)
  const event = await eventRef.get()
  if (!watch.exists || !event.exists) throw new Error('Acceptance watch or prior notification missing.')
  const read = await found.profileRef.collection('notificationReads').doc(originalId).get()
  const allMessages = await found.profileRef.collection('notifications').get()
  const eventPrefix = `${WATCH_ID}-${activationId}-`
  return {
    active: isActiveTitleWatch(watch.data()),
    completed: watch.data()?.status === 'completed',
    activationId: watch.data()?.activationId,
    notificationId: watch.data()?.completionNotificationId || originalId,
    eventPhase: event.data()?.phase,
    body: event.data()?.body,
    startsAt: millis(event.data()?.startsAt),
    expiresAt: millis(event.data()?.expiresAt),
    readAt: read.exists ? millis(read.data()?.readAt) : null,
    notificationCount: allMessages.docs.filter(x => x.id.startsWith(eventPrefix)).length,
  }
}

async function main() {
  const [{ applicationDefault, deleteApp, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/firestore'),
  ])
  if (!process.env.TMDB_API_READ_TOKEN) throw new Error('TMDB token required.')
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'movie-hub-62459',
  }, 'title-alert-lifecycle-acceptance')
  try {
    const db = getFirestore(app)
    const watch = await locate(db)
    const id = alertNotificationId(watch.watchData)
    if (!id) throw new Error('No valid initial notification ID.')
    const expected = { originalId: id, activationId: watch.watchData.activationId }
    const before = await inspect(watch, expected)
    if (!before.active && !before.completed) throw new Error('Invalid watch state; no mutation performed.')
    if (before.notificationCount !== 1) throw new Error('Initial notification missing or duplicated.')
    const options = {
      db, token: process.env.TMDB_API_READ_TOKEN,
      onlyWatchId: WATCH_ID, tvTitles: new Map(),
    }
    const first = await runTitleAlertCheck(options)
    const replay = await runTitleAlertCheck(options)
    const after = await inspect(watch, expected)
    const outcome = verifyLegacyCompletion(before, after, first, replay)
    console.log(JSON.stringify(outcome))
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
