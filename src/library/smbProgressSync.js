import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { withDeadline } from '../performance/cooperativeWork.js'
import { titleMediaKey } from './sharedMediaModel.js'
import { movieHubPlayerPalette, normalizeSmbProgress, shouldSyncSmbProgress, validSmbProgressId } from './smbProgressModel.js'

const syncing = new Map()
const syncAgain = new Set()
const progressRef = (db, uid, profileId, id) => doc(db, 'users', uid, 'profiles', profileId, 'smbProgress', id)

/** New native clients receive the freshest available cloud checkpoint; older APKs still play normally. */
export async function launchSmbWithResume(entry, { userId, profileId, item, nativeBridge, isCurrent = () => true }) {
  if (!userId || !profileId || !entry.id || typeof nativeBridge?.playSmbMediaWithResume !== 'function'
      || typeof nativeBridge?.smbProgressId !== 'function') {
    if (isCurrent()) nativeBridge?.playSmbMedia(entry.label, entry.url)
    return
  }
  const id = nativeBridge.smbProgressId(titleMediaKey(item), entry.id, entry.url)
  if (!validSmbProgressId(id)) {
    if (isCurrent()) nativeBridge.playSmbMedia(entry.label, entry.url)
    return
  }
  let remote = null
  try {
    remote = await withDeadline((async () => {
      const { firebaseReady } = await import('../lib/firebase.js')
      const { db, auth } = await firebaseReady
      if (auth.currentUser?.uid !== userId) return null
      const snap = await getDocFromServer(progressRef(db, userId, profileId, id))
      return normalizeSmbProgress(snap.data())
    })(), 1500)
  } catch { /* Offline or delayed: native local record remains authoritative for this launch. */ }
  if (!isCurrent()) return
  const palette = movieHubPlayerPalette(getComputedStyle(document.documentElement))
  nativeBridge.playSmbMediaWithResume(entry.label, entry.url, userId, profileId, id,
    JSON.stringify(remote), JSON.stringify(palette))
}

/** Acknowledges only the exact persisted local record after the server transaction succeeds.
 * Late/offline checkpoints cannot replace a newer position or completion tombstone. */
export function flushSmbProgress(userId, profileId, nativeBridge = window.MovieHubNative) {
  if (!userId || !profileId || typeof nativeBridge?.pendingSmbProgress !== 'function'
      || typeof nativeBridge?.acknowledgeSmbProgress !== 'function') return Promise.resolve()
  const scope = `${userId}:${profileId}`
  if (syncing.has(scope)) {
    syncAgain.add(scope)
    return syncing.get(scope)
  }
  const promise = (async () => {
    const { firebaseReady } = await import('../lib/firebase.js')
    const { db, auth } = await firebaseReady
    if (auth.currentUser?.uid !== userId) return
    const records = JSON.parse(nativeBridge.pendingSmbProgress(userId, profileId))
    if (!Array.isArray(records)) return
    for (const raw of records) {
      if (auth.currentUser?.uid !== userId) return
      const local = normalizeSmbProgress(raw)
      if (!local || !validSmbProgressId(raw.id)) continue
      const ref = progressRef(db, userId, profileId, raw.id)
      const accepted = await runTransaction(db, async transaction => {
        const snap = await transaction.get(ref)
        const remote = normalizeSmbProgress(snap.data())
        if (shouldSyncSmbProgress(local, remote)) {
          transaction.set(ref, { ...local, schemaVersion: 1, updatedAt: serverTimestamp() })
          return local
        }
        return remote
      })
      nativeBridge.acknowledgeSmbProgress(userId, profileId, raw.id, String(local.updatedAtMs), JSON.stringify(accepted))
    }
  })().catch(() => { /* Keep the durable native outbox for the next online/resume event. */ })
    .finally(() => {
      syncing.delete(scope)
      if (syncAgain.delete(scope)) void flushSmbProgress(userId, profileId, nativeBridge)
    })
  syncing.set(scope, promise)
  return promise
}
