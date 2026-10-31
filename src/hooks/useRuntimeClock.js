import { useCallback, useEffect, useId, useSyncExternalStore } from 'react'
import { runtimeClock } from '../performance/runtimeClock.js'

export function useRuntimeClock(nextDeadline, enabled = true) {
  const id = useId()
  const subscribe = useCallback((listener) => runtimeClock.subscribe(id, listener), [id])
  const getSnapshot = useCallback(() => runtimeClock.getSnapshot(id), [id])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const deadline = enabled ? nextDeadline(snapshot.now) : Infinity
  useEffect(() => {
    runtimeClock.setDeadline(id, deadline)
  }, [deadline, id, snapshot.revision])
  return snapshot
}
