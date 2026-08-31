import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export async function runPhase0WriteReadTest(uid) {
  if (!db || !uid) {
    throw new Error('Firestore oder Benutzer-ID fehlt.')
  }

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
