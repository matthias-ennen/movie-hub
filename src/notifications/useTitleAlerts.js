import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { providers } from '../data/catalog.js'
import { db } from '../lib/firebase.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { alertTitleKey, includedProviderIds, dueTvAiring, alertNotificationId, tvAiringId, tvMessage, watchId } from './titleAlertModel.js'
import { loadFreshTvAirings } from './loadFreshTvAirings.js'

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
    if (previous.exists()) {
      await deleteDoc(watchRef)
      return false
    }
    const watch = {
      schemaVersion: 1,
      type: id.startsWith('series-') ? 'series' : 'movie',
      tmdbId: Number(item.tmdbId),
      title: String(item.title || '').trim().slice(0, 160),
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
        const airing = dueTvAiring(airings, account.data()?.waipuStationSettings?.disabledStationIds, now)
        if (airing) {
          notificationId = tvAiringId(watch, airing)
          notification = {
            title: 'Bald im TV', body: tvMessage(airing, watch.title),
            expiresAt: Timestamp.fromMillis(Date.parse(airing.stopTime)),
          }
        }
      } catch (error) {
        // The observation remains active. The next trusted check will retry.
        console.warn('TV-Erstprüfung konnte nicht geladen werden.', error)
      }
    }
    if (notification && notificationId) {
      try {
        await setDoc(doc(db, ...path, 'notifications', notificationId), {
          schemaVersion: 1, kind, titleType: watch.type, tmdbId: watch.tmdbId,
          title: notification.title, mediaTitle: watch.title, body: notification.body,
          startsAt: serverTimestamp(), expiresAt: notification.expiresAt,
        })
      } catch {
        throw new Error('Beobachtung ist aktiv. Die Sofortmeldung konnte noch nicht gespeichert werden; der nächste Datenlauf prüft erneut.')
      }
    }
    return true
  }

  return {
    ready: ready && loadedProfileId === profileId,
    isEnabled: (item, kind) => loadedProfileId === profileId && Boolean(watches[watchId(item, kind)]),
    canWatch: (item) => Boolean(alertTitleKey(item)),
    toggle,
  }
}
