import { useSyncExternalStore } from 'react'
import { recordPerformanceEvent } from './performanceDiagnostics.js'

let account = null, ready = false, background = false, cancelAdmission = null
const listeners = new Set()
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
const notify = () => { for (const listener of listeners) listener() }

export function setStartupAccount(uid) {
  if (account === uid) return
  cancelAdmission?.(); cancelAdmission = null
  account = uid; ready = false; background = false; notify()
}
export function markStartupReady(uid) {
  if (account !== uid || ready) return
  ready = true
  recordPerformanceEvent('startup:web-ready')
}
export function markStartupInteractive(uid) {
  if (account !== uid || !ready || background || cancelAdmission) return
  recordPerformanceEvent('startup:interactive', globalThis.window?.__movieHubNativeStartupTimings)
  const raf = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0))
  const caf = globalThis.cancelAnimationFrame || clearTimeout
  let second, timer, cancelled = false
  const first = raf(() => {
    second = raf(() => {
      timer = setTimeout(() => {
        if (cancelled || account !== uid) return
        background = true
        recordPerformanceEvent('startup:background-admitted')
        notify()
      }, 200)
    })
  })
  cancelAdmission = () => { cancelled = true; caf(first); caf(second); clearTimeout(timer) }
}
export function useBackgroundReady(uid = undefined) {
  return useSyncExternalStore(subscribe, () => background && (uid === undefined || account === uid), () => false)
}
