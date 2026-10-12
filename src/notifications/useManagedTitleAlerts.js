import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, documentId, onSnapshot, query, runTransaction, where } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { alertNotificationId } from './titleAlertModel.js'
import { activeTitleWatchRows, cancelTitleWatch, titleWatchStatusText } from './titleWatchManagement.js'
import { useTitleWatchSnapshot } from './useTitleWatchSnapshot.js'

export function useManagedTitleAlerts(userId, profileId) {
  const { watches, ready, error } = useTitleWatchSnapshot(userId, profileId)
  const active = useMemo(() => activeTitleWatchRows(watches), [watches])
  const scope = JSON.stringify([userId, profileId])
  const currentScope = useRef(scope)
  currentScope.current = scope
  useEffect(() => {
    currentScope.current = scope
    return () => { currentScope.current = null }
  }, [scope])
  const idsKey = JSON.stringify(active.filter((watch) => watch.kind === 'tv').map((watch) => alertNotificationId(watch)).sort())
  const [schedule, setSchedule] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const ids = JSON.parse(idsKey)
    if (!db || !userId || !profileId || !ids.length) return undefined
    let live = true
    const batches = new Map()
    const errors = new Set()
    const subscriptions = []
    const publish = () => {
      if (live) setSchedule({ scope, idsKey, events: Object.assign({}, ...batches.values()), failed: errors.size > 0,
        ready: batches.size + errors.size === Math.ceil(ids.length / 30) })
    }
    // Only current TV activation documents, in bounded batches. No historical
    // inbox read, per-row listener, provider fetch, or changes to read-state.
    for (let offset = 0; offset < ids.length; offset += 30) {
      const source = query(collection(db, 'users', userId, 'profiles', profileId, 'notifications'),
        where(documentId(), 'in', ids.slice(offset, offset + 30)))
      subscriptions.push(onSnapshot(source, (result) => {
        batches.set(offset, Object.fromEntries(result.docs.map((entry) => [entry.id, { ...entry.data(), id: entry.id }])))
        errors.delete(offset)
        publish()
      }, () => { batches.delete(offset); errors.add(offset); publish() }))
    }
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { live = false; subscriptions.forEach((unsubscribe) => unsubscribe()); window.clearInterval(clock) }
  }, [userId, profileId, scope, idsKey])

  const currentSchedule = schedule?.scope === scope && schedule.idsKey === idsKey ? schedule : null
  const items = useMemo(() => active.map((watch) => {
    const event = currentSchedule?.events[alertNotificationId(watch)]
    const statusText = watch.kind !== 'tv' || event || currentSchedule?.ready && !currentSchedule.failed
      ? titleWatchStatusText(watch, event, now)
      : currentSchedule?.failed ? 'TV-Termin konnte nicht geladen werden.' : 'TV-Termin wird geladen …'
    return { ...watch, statusText }
  }), [active, currentSchedule, now])

  async function disable(watch) {
    if (!db || !userId || !profileId || currentScope.current !== scope
      || !active.some((entry) => entry.id === watch.id && entry.activationId === watch.activationId)) {
      throw new Error('Die Beobachtung wurde inzwischen geändert. Bitte prüfe die aktuelle Liste.')
    }
    const ref = doc(db, 'users', userId, 'profiles', profileId, 'titleAlerts', watch.id)
    const result = await runTransaction(db, (transaction) => cancelTitleWatch(transaction, ref, watch,
      () => currentScope.current === scope))
    if (result === 'activation-changed' || result === 'scope-changed') {
      throw new Error('Die Beobachtung wurde inzwischen geändert. Bitte prüfe die aktuelle Liste.')
    }
  }

  return { items, ready, error, disable }
}
