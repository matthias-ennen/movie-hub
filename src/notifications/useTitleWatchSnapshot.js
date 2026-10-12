import { useEffect, useState } from 'react'
import { collection, onSnapshot, or, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

const EMPTY_WATCHES = Object.freeze({})

// Shared by title details and settings. Completed V2 history is not loaded;
// legacy V1 watches remain readable until their existing lifecycle completes.
export function useTitleWatchSnapshot(userId, profileId) {
  const scope = JSON.stringify([userId, profileId])
  const [snapshot, setSnapshot] = useState(null)
  useEffect(() => {
    let live = true
    if (!db || !userId || !profileId) return undefined
    const source = query(collection(db, 'users', userId, 'profiles', profileId, 'titleAlerts'),
      or(where('status', '==', 'active'), where('schemaVersion', '==', 1)))
    const unsubscribe = onSnapshot(source, (result) => {
      if (live) setSnapshot({ scope, watches: Object.fromEntries(result.docs.map((entry) => [entry.id, entry.data()])), error: '' })
    }, () => {
      if (live) setSnapshot({ scope, watches: EMPTY_WATCHES, error: 'Beobachtungen konnten nicht geladen werden. Bitte öffne die Einstellungen erneut.' })
    })
    return () => { live = false; unsubscribe() }
  }, [userId, profileId, scope])
  // Effects clean up after render; do not paint a previous account/profile.
  const current = snapshot?.scope === scope ? snapshot : null
  return { watches: current?.watches || EMPTY_WATCHES, ready: Boolean(current), error: current?.error || '' }
}
