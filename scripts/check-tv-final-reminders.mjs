import { pathToFileURL } from 'node:url'
import { alertNotificationId, watchId } from '../src/notifications/titleAlertModel.js'
import { isActiveTitleWatch } from '../src/notifications/titleAlertLifecycleModel.js'
import {
  FINAL_LEAD_MS, FINAL_LATE_GRACE_MS, FINAL_MAX_BATCH,
  isCanonicalFirstTvEvent, tvFinalNotification,
} from '../src/notifications/tvFinalReminderModel.js'

// Stand-alone, bounded query against existing notification records. No TMDB,
// Waipu/Joyn fetches and no dependency on the nightly catalog publication.
// The production minute scheduler must NOT be enabled without approval.
export async function runTvFinalReminderCheck({ db, now = Date.now(), maxBatch = FINAL_MAX_BATCH } = {}) {
  if (!db?.collectionGroup || !db?.runTransaction) throw new Error('Firestore admin access required')
  if (!Number.isFinite(now)) throw new Error('Invalid current time')
  const limit = Math.min(FINAL_MAX_BATCH, Math.max(1, Number(maxBatch) || FINAL_MAX_BATCH))
  const firstEvents = await db.collectionGroup('notifications')
    .where('phase', '==', 'tv-found')
    .where('airingStartAt', '>=', new Date(now - FINAL_LATE_GRACE_MS))
    .where('airingStartAt', '<=', new Date(now + FINAL_LEAD_MS))
    .orderBy('airingStartAt', 'asc')
    .limit(limit)
    .get()
  const result = { considered: firstEvents.docs.length, finalCreated: 0, skipped: 0, failed: 0, saturated: firstEvents.docs.length >= limit }
  for (const first of firstEvents.docs) {
    try {
      const parts = first.ref.path.split('/')
      // A notification is private to users/{uid}/profiles/{profileId}.
      if (parts.length !== 6 || parts[0] !== 'users' || parts[2] !== 'profiles'
        || parts[4] !== 'notifications') { result.skipped++; continue }
      const profile = first.ref.parent.parent
      const type = first.data()?.titleType
      const tmdbId = Number(first.data()?.tmdbId)
      const id = watchId({ type, tmdbId }, 'tv')
      if (!id) { result.skipped++; continue }
      const watchRef = profile.collection('titleAlerts').doc(id)
      const stateRef = profile.collection('titleAlertState').doc(id)
      // The watch ID and activation, not a user-supplied event title, determine
      // the terminal event ID. The transaction re-reads all involved documents.
      const created = await db.runTransaction(async (tx) => {
        const firstSnap = await tx.get(first.ref)
        const watchSnap = await tx.get(watchRef)
        if (!firstSnap.exists || !watchSnap.exists) return false
        const watch = watchSnap.data()
        if (!isActiveTitleWatch(watch) || watch.kind !== 'tv'
          || !isCanonicalFirstTvEvent(watch, firstSnap.id)) return false
        const finalId = alertNotificationId(watch, 'final')
        if (!finalId) return false
        const finalRef = profile.collection('notifications').doc(finalId)
        const [stateSnap, existing] = await Promise.all([
          tx.get(stateRef), tx.get(finalRef),
        ])
        const state = stateSnap.exists ? stateSnap.data() : {}
        if (existing.exists || (state.activationId && state.activationId !== watch.activationId)) return false
        const message = tvFinalNotification(watch, firstSnap.data(), now)
        if (!message) return false
        tx.create(finalRef, message)
        tx.update(watchRef, {
          schemaVersion: 2, status: 'completed', completedAt: new Date(now),
          completionNotificationId: finalId,
        })
        tx.set(stateRef, {
          ...state, activationId: watch.activationId,
          status: 'completed', completedAt: new Date(now),
          finalNotificationId: finalId, updatedAt: new Date(now),
        })
        return true
      })
      if (created) result.finalCreated++
      else result.skipped++
    } catch (error) {
      result.failed++
      console.warn(`Final TV reminder failed (${first.id}): ${error.message}`)
    }
  }
  if (result.failed) throw new Error(`Final TV reminder failed for ${result.failed} of ${result.considered} candidate events`)
  if (result.saturated) console.warn('Final TV reminder batch is full: adjust schedule/batch limit before production.')
  return result
}

async function main() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required; refusing implicit target')
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId })
  const result = await runTvFinalReminderCheck({ db: getFirestore(app) })
  console.log(JSON.stringify(result))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1 })
}
