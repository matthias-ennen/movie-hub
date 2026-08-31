import { getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
