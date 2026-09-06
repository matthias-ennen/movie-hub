import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'

export async function runPhase0WriteReadTest(uid) {
  if (!uid) {
    throw new Error('Benutzer-ID fehlt.')
  }

  const { db } = await firebaseReady
  const testRef = doc(db, 'users', uid, 'diagnostics', 'phase0')

  await setDoc(
    testRef,
    {
      message: 'Movie Hub Phase 0 write/read test',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  const snapshot = await getDoc(testRef)

  if (!snapshot.exists()) {
    throw new Error('Testdokument konnte nach dem Schreiben nicht gelesen werden.')
  }

  return snapshot.data()
}
