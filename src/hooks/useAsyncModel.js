import { useEffect, useState } from 'react'
import { recordPerformanceEvent } from '../performance/performanceDiagnostics.js'

// Factory is memoized by the caller. Changing it cancels obsolete computation;
// previous content is retained only within the same presentation scope.
export function useAsyncModelState(factory, scope, initialValue, name) {
  const [state, setState] = useState({ scope, value: initialValue, factory: null, error: null })
  useEffect(() => {
    const controller = new AbortController()
    const startedAt = performance.now()
    factory(controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setState({ scope, value, factory, error: null })
      recordPerformanceEvent(`${name}:ready`, { durationMs: performance.now() - startedAt })
    }).catch((error) => {
      if (controller.signal.aborted || error?.name === 'AbortError') return
      recordPerformanceEvent(`${name}:error`)
      setState((current) => ({ value: current.scope === scope ? current.value : initialValue, scope, factory, error }))
      console.warn('Ansicht konnte nicht aufbereitet werden.', error)
    })
    return () => controller.abort()
  }, [factory, name, scope])
  return { value: state.scope === scope ? state.value : initialValue,
    pending: state.scope !== scope || state.factory !== factory, error: state.error }
}

export function useAsyncModel(factory, scope, initialValue, name) {
  return useAsyncModelState(factory, scope, initialValue, name).value
}
