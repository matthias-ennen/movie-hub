import { useSyncExternalStore } from 'react'

let account = null
let ready = false
const listeners = new Set()
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
const notify = () => { for (const listener of listeners) listener() }

export function setStartupAccount(uid) {
  if (account === uid) return
  account = uid; ready = false; notify()
}
export function markStartupReady(uid) {
  if (account !== uid || ready) return
  ready = true; notify()
}
export function useBackgroundReady(uid = undefined) {
  return useSyncExternalStore(subscribe, () => ready && (uid === undefined || account === uid), () => false)
}
