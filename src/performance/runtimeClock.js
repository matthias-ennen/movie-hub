import { recordPerformanceEvent } from './performanceDiagnostics.js'

// One timer for all currently subscribed deadlines. Each subscriber gets a
// stable snapshot until its own deadline (or a foreground return) is due.
export function createRuntimeClock({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  const records = new Map()
  let timer = null
  let installed = false
  let hidden = false
  let lastResume = -Infinity
  const ensure = (id) => {
    if (!records.has(id)) records.set(id, { deadline: Infinity, listeners: new Set(), snapshot: { now: now(), revision: 0, reason: 'initial' } })
    return records.get(id)
  }
  const cancelTimer = () => { if (timer !== null) clearTimer(timer); timer = null }
  function schedule() {
    cancelTimer()
    if (hidden) return
    const deadlines = [...records.values()].filter((record) => record.listeners.size).map((record) => record.deadline)
    const deadline = Math.min(...deadlines)
    if (Number.isFinite(deadline)) timer = setTimer(() => refresh('deadline'), Math.max(0, Math.min(2_147_483_647, deadline - now() + 1)))
  }
  function refresh(reason = 'resume') {
    const timestamp = now()
    if (reason === 'resume' && timestamp >= lastResume && timestamp - lastResume < 1000) return
    if (reason === 'resume') lastResume = timestamp
    const notifications = []
    for (const record of records.values()) {
      if (!record.listeners.size || (reason === 'deadline' && record.deadline > timestamp)) continue
      record.deadline = Infinity
      record.snapshot = { now: timestamp, revision: record.snapshot.revision + 1, reason }
      notifications.push(...record.listeners)
    }
    recordPerformanceEvent('runtime:clock', { reason, subscribers: notifications.length })
    for (const notify of notifications) notify()
    schedule()
  }
  function foreground() {
    if (documentRef?.visibilityState === 'hidden') { hidden = true; cancelTimer(); return }
    hidden = false
    refresh('resume')
    schedule()
  }
  function install() {
    if (installed) return
    installed = true
    hidden = documentRef?.visibilityState === 'hidden'
    documentRef?.addEventListener('visibilitychange', foreground)
    windowRef?.addEventListener('focus', foreground)
    windowRef?.addEventListener('pageshow', foreground)
  }
  function uninstall() {
    if ([...records.values()].some((record) => record.listeners.size)) return
    cancelTimer()
    installed = false
    documentRef?.removeEventListener('visibilitychange', foreground)
    windowRef?.removeEventListener('focus', foreground)
    windowRef?.removeEventListener('pageshow', foreground)
  }
  return {
    getSnapshot: (id) => ensure(id).snapshot,
    subscribe(id, listener) {
      const record = ensure(id)
      record.listeners.add(listener)
      install()
      schedule()
      return () => { record.listeners.delete(listener); if (!record.listeners.size) records.delete(id); uninstall(); schedule() }
    },
    setDeadline(id, deadline) { ensure(id).deadline = Number.isFinite(deadline) ? deadline : Infinity; schedule() },
    refresh,
    dispose() { records.clear(); uninstall() },
  }
}

export const runtimeClock = createRuntimeClock()
