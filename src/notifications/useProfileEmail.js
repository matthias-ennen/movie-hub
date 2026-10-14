import { useEffect, useState } from 'react'
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import { nextEmailPreferences, validEmailPreferences } from './profileEmailModel.js'

export function useProfileEmail(userId, profileId) {
  const [state, setState] = useState({ ready: false, preferences: null, verification: null, error: '' })
  useEffect(() => {
    let disposed = false
    const stops = []
    setState({ ready: false, preferences: null, verification: null, error: '' })
    firebaseReady.then(({ db }) => {
      if (disposed) return
      const base = ['users', userId, 'profiles', profileId]
      let preferencesReady = false
      let verificationReady = false
      let failed = false
      const fail = () => {
        failed = true
        if (!disposed) setState((s) => ({ ...s, ready: false, error: 'E-Mail-Einstellungen konnten nicht geladen werden.' }))
      }
      stops.push(onSnapshot(doc(db, ...base, 'emailPreferences', 'current'), (snapshot) => {
        if (disposed) return
        const preferences = snapshot.exists() ? snapshot.data() : null
        if (preferences && !validEmailPreferences(preferences)) { fail(); return }
        preferencesReady = true
        setState((s) => ({ ...s, preferences, ready: !failed && verificationReady }))
      }, fail))
      stops.push(onSnapshot(doc(db, ...base, 'emailVerification', 'current'), (snapshot) => {
        if (disposed) return
        verificationReady = true
        setState((s) => ({ ...s, verification: snapshot.exists() ? snapshot.data() : null, ready: !failed && preferencesReady }))
      }, fail))
    }).catch(() => {
      if (!disposed) setState((s) => ({ ...s, error: 'E-Mail-Einstellungen konnten nicht geladen werden.' }))
    })
    return () => { disposed = true; stops.forEach((stop) => stop()) }
  }, [userId, profileId])

  async function save(input) {
    const { db } = await firebaseReady
    const ref = doc(db, 'users', userId, 'profiles', profileId, 'emailPreferences', 'current')
    return runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref)
      const next = nextEmailPreferences(snapshot.exists() ? snapshot.data() : null, input, serverTimestamp())
      tx.set(ref, next)
      return next
    })
  }
  return { ...state, save }
}
