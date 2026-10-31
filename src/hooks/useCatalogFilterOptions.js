import { useEffect, useState } from 'react'
import { readPublicFilterOptions } from '../performance/publicCatalog.js'

export function useCatalogFilterOptions(enabled) {
  const [state, setState] = useState({ status: 'idle', options: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled || state.status === 'ready') return undefined
    const controller = new AbortController()
    setState({ status: 'loading', options: null })
    readPublicFilterOptions({ signal: controller.signal }).then(options => {
      if (!controller.signal.aborted) setState({ status: 'ready', options })
    }, () => { if (!controller.signal.aborted) setState({ status: 'error', options: null }) })
    return () => controller.abort()
    // Completed public options survive leaving/re-entering the editor.
  }, [enabled, attempt])
  return { ...state, retry: () => setAttempt(value => value + 1) }
}
