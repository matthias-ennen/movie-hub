import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore'

// Fake identity and test project only. The runner rejects any external request.
const projectId = 'demo-moviehub-email-ui'
const app = initializeApp({ projectId, apiKey: 'local-test-key', appId: 'local-test-app' })
export const db = getFirestore(app)
connectFirestoreEmulator(db, '127.0.0.1', __EMAIL_TEST_EMULATOR_PORT__, { mockUserToken: { sub: 'email-ui-owner' } })
export const firebaseReady = Promise.all(['main', 'family'].map((id) =>
  setDoc(doc(db, 'users', 'email-ui-owner', 'profiles', id), {
    displayName: id === 'main' ? 'Hauptprofil' : 'Familie', role: id === 'main' ? 'primary' : 'member',
  }, { merge: true }))).then(() => ({ app, db }))
