import { getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId']

function isCompleteConfig(config) {
  return requiredConfigKeys.every((key) => Boolean(config[key]))
}

async function loadFirebaseConfig() {
  if (isCompleteConfig(envConfig)) {
    return envConfig
  }

  const response = await fetch('/__/firebase/init.json', { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(
      'Firebase-Konfiguration konnte nicht geladen werden. Auf Firebase Hosting wird sie automatisch bereitgestellt; lokal bitte VITE_FIREBASE_* Variablen verwenden.',
    )
  }

  const hostingConfig = await response.json()

  if (!isCompleteConfig(hostingConfig)) {
    throw new Error('Firebase Hosting hat keine vollständige Web-Konfiguration geliefert.')
  }

  return hostingConfig
}

export let app = null
export let auth = null
export let db = null

export const firebaseReady = loadFirebaseConfig().then(async (firebaseConfig) => {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  await setPersistence(auth, browserLocalPersistence)

  return { app, auth, db }
})
