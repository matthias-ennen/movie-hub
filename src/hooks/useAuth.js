import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { firebaseReady } from '../lib/firebase.js'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let unsubscribe = () => {}
    let active = true

    firebaseReady
      .then(({ auth }) => {
        if (!active) return

        unsubscribe = onAuthStateChanged(
          auth,
          (nextUser) => {
            if (!active) return
            setUser(nextUser)
            setLoading(false)
          },
          (nextError) => {
            if (!active) return
            setError(nextError)
            setLoading(false)
          },
        )
      })
      .catch((nextError) => {
        if (!active) return
        setError(nextError)
        setLoading(false)
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return { user, loading, error }
}
