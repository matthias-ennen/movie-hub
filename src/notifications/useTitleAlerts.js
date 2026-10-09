import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { providers } from '../data/catalog.js'
import { db } from '../lib/firebase.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { alertTitleKey, includedProviderIds, dueTvAiring, filterEnabledTvAirings, alertNotificationId, tvAiringId, tvMessage, watchId } from './titleAlertModel.js'
import { loadFreshTvAirings } from './loadFreshTvAirings.js'
import { isActiveTitleWatch, personalHardExpiry } from './titleAlertLifecycleModel.js'

export function useTitleAlerts(userId, profileId) {
  const [watches, setWatches] = useState({})
  const [ready, setReady] = useState(false)
  const [loadedProfileId, setLoadedProfileId] = useState(null)
  const { uid: providerUserId, loading: providersLoading, enabledProviderIds } = useProviderSelection()

  useEffect(() => {
    setWatches({})
    setReady(false)
    setLoadedProfileId(null)
    if (!db || !userId || !profileId) return undefined
    return onSnapshot(collection(db, 'users', userId, 'profiles', profileId, 'titleAlerts'),
      (snapshot) => {
        setWatches(Object.fromEntries(snapshot.docs.map((entry) => [entry.id, entry.data()])))
        setReady(true)
        setLoadedProfileId(profileId)
      }, () => setReady(true))
  }, [userId, profileId])

  async function toggle(item, kind) {
    const id = watchId(item, kind)
    if (!id || !db || !userId || !profileId) throw new Error('Dieser Titel kann noch nicht beobachtet werden.')
    const path = ['users', userId, 'profiles', profileId]
    const watchRef = doc(db, ...path, 'titleAlerts', id)
    const previous = await getDoc(watchRef)
    if (previous.exists() && isActiveTitleWatch(previous.data())) {
      await deleteDoc(watchRef)
      return false
    }
    const watch = {
      schemaVersion: 2, status: 'active',
      type: id.startsWith('series-') ? 'series' : 'movie',
      tmdbId: Number(item.tmdbId),
      // Preserve the immutable title when reactivating an existing V2 watch.
      title: previous.exists() ? previous.data().title : String(item.title || '').trim().slice(0, 160),
      kind,
      activationId: crypto.randomUUID(),
      createdAt: serverTimestamp(),
    }
    if (!watch.title) throw new Error('Für diesen Titel fehlt noch ein Name.')
    await setDoc(watchRef, watch)

    // The currently published title data can produce the first message at once.
    // The trusted daily check independently verifies later provider/TV changes.
    let notification = null
    let notificationId = null
    let tvAiring = null
    const now = Date.now()
    if (kind === 'included' && providerUserId === userId && !providersLoading) {
      const providerIds = includedProviderIds(item.providerOffers, enabledProviderIds)
      if (providerIds.length) {
        const names = providerIds.map((providerId) => providers[providerId]?.label || providerId).join(', ')
        notificationId = alertNotificationId(watch)
        notification = { title: 'Jetzt inklusive', body: `${watch.title} ist ohne Aufpreis bei ${names} verfügbar.`, expiresAt: Timestamp.fromMillis(now + 30 * 86400000) }
      }
    } else if (kind === 'tv') {
      try {
        const [airings, account] = await Promise.all([
          loadFreshTvAirings(item, now),
          getDoc(doc(db, 'users', userId)),
        ])
        const airing = dueTvAiring(filterEnabledTvAirings(airings, account.data() || {}), [], now)
        if (airing) {
          tvAiring = airing
          notificationId = alertNotificationId(watch, 'initial')
          notification = {
            title: 'Bald im TV', body: tvMessage(airing, watch.title),
            expiresAt: Timestamp.fromDate(personalHardExpiry('tv', {
              createdAt: now, airingEndsAt: airing.stopTime,
            })),
          }
        }
      } catch (error) {
        // The observation remains active. The next trusted check will retry.
        console.warn('TV-Erstprüfung konnte nicht geladen werden.', error)
      }
    }
    if (notification && notificationId) {
      const messageRef = doc(db, ...path, 'notifications', notificationId)
      try {
        if (kind === 'included') {
          // The first message and terminal watch status must commit together.
          // The server uses the same activation-specific event ID and can
          // safely finish any incomplete attempt on its next check.
          await runTransaction(db, async (transaction) => {
            const [current, existingMessage] = await Promise.all([
              transaction.get(watchRef), transaction.get(messageRef),
            ])
            if (!current.exists() || current.data().activationId !== watch.activationId
              || !isActiveTitleWatch(current.data())) return
            if (!existingMessage.exists()) {
              transaction.set(messageRef, {
                schemaVersion: 2, kind, titleType: watch.type, tmdbId: watch.tmdbId,
                title: notification.title, mediaTitle: watch.title, body: notification.body,
                phase: 'included-found', eventAt: serverTimestamp(),
                completedAt: serverTimestamp(), startsAt: serverTimestamp(),
                expiresAt: notification.expiresAt,
              })
            }
            transaction.update(watchRef, {
              schemaVersion: 2, status: 'completed',
              completedAt: serverTimestamp(), completionNotificationId: notificationId,
            })
          })
        } else {
          // The first TV notice is NOT terminal. Use the same ID as the server
          // and record structured airing data for the later 5-minute stage.
          await runTransaction(db, async (transaction) => {
            const [current, existing] = await Promise.all([
              transaction.get(watchRef), transaction.get(messageRef),
            ])
            if (!current.exists() || !isActiveTitleWatch(current.data())
              || current.data().activationId !== watch.activationId || existing.exists()) return
            transaction.set(messageRef, {
              schemaVersion: 2, kind, titleType: watch.type, tmdbId: watch.tmdbId,
              title: notification.title, mediaTitle: watch.title, body: notification.body,
              phase: 'tv-found', eventAt: serverTimestamp(), scheduleStatus: 'scheduled',
              startsAt: serverTimestamp(), expiresAt: notification.expiresAt,
              airingStartAt: Timestamp.fromMillis(Date.parse(tvAiring.startTime)),
              ...(Number.isFinite(Date.parse(tvAiring.stopTime))
                ? { airingEndsAt: Timestamp.fromMillis(Date.parse(tvAiring.stopTime)) } : {}),
              stationName: String(tvAiring.stationName || '').slice(0, 160),
            })
          })
        }
      } catch {
        throw new Error('Beobachtung ist aktiv. Die Sofortmeldung konnte noch nicht gespeichert werden; der nächste Datenlauf prüft erneut.')
      }
      if (kind === 'included') return 'completed'
    }
    return true
  }

  return {
    ready: ready && loadedProfileId === profileId,
    isEnabled: (item, kind) => loadedProfileId === profileId && isActiveTitleWatch(watches[watchId(item, kind)]),
    canWatch: (item) => Boolean(alertTitleKey(item)),
    toggle,
  }
}
