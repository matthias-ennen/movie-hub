import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firebaseReady } from '../lib/firebase.js'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return undefined
    }

    let unsubscribe = () => {}

    firebaseReady
      .then(() => {
        unsubscribe = onAuthStateChanged(
          auth,
          (nextUser) => {
            setUser(nextUser)
            setLoading(false)
          },
          (nextError) => {
            setError(nextError)
            setLoading(false)
          },
        )
      })
      .catch((nextError) => {
        setError(nextError)
        setLoading(false)
      })

    return () => unsubscribe()
  }, [])

  return { user, loading, error }
}
