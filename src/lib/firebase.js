import { getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Firebase Web configuration is public client configuration. It identifies the
// Firebase project; authorization is enforced by Authentication + Firestore Rules.
// Environment variables can override these values for local/testing scenarios.
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyAyyVfuxIe4bkTcmxLalA9lt82QJ23xLVk',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'movie-hub-62459.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'movie-hub-62459',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'movie-hub-62459.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '612913221205',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:612913221205:web:637ee2b917f32eeadacedc',
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-PY40R98PV1',
}

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId']

export const isFirebaseConfigured = requiredConfigKeys.every(
  (key) => Boolean(firebaseConfig[key]),
)

export const missingFirebaseConfigKeys = requiredConfigKeys.filter(
  (key) => !firebaseConfig[key],
)

let app = null
let auth = null
let db = null
let firebaseReady = Promise.resolve()

if (isFirebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  firebaseReady = setPersistence(auth, browserLocalPersistence)
}

export { app, auth, db, firebaseReady }
