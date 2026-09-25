import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

function activeAnnouncement(item, now) {
  const start = item.startsAt?.toMillis?.()
  const end = item.expiresAt?.toMillis?.()
  return item.schemaVersion === 1 && (item.status === 'published' || (item.id?.startsWith('profile:') && ['included', 'tv'].includes(item.kind)))
    && ['inbox', 'startup'].includes(item.mode)
    && typeof item.title === 'string' && typeof item.body === 'string'
    && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end
}

export function useAnnouncements(userId, profileId) {
  const [announcements, setAnnouncements] = useState([])
  const [globalReadIds, setGlobalReadIds] = useState(new Set())
  const [personal, setPersonal] = useState([])
  const [personalReadIds, setPersonalReadIds] = useState(new Set())
  const [announcementsReady, setAnnouncementsReady] = useState(false)
  const [readsReady, setReadsReady] = useState(false)
  const [personalReady, setPersonalReady] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!userId || !db) return undefined
    const unsubscribeAnnouncements = onSnapshot(
      query(collection(db, 'announcements'), where('status', '==', 'published')),
      (snapshot) => {
        setAnnouncements(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
        setAnnouncementsReady(true)
      },
      () => { setError('Mitteilungen konnten nicht geladen werden.'); setAnnouncementsReady(true) },
    )
    const unsubscribeReads = onSnapshot(
      collection(db, 'users', userId, 'announcementReads'),
      (snapshot) => { setGlobalReadIds(new Set(snapshot.docs.map((entry) => entry.id))); setReadsReady(true) },
      () => { setError('Lesestatus konnte nicht geladen werden.'); setReadsReady(true) },
    )
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { unsubscribeAnnouncements(); unsubscribeReads(); window.clearInterval(clock) }
  }, [userId])

  useEffect(() => {
    setPersonal([])
    setPersonalReadIds(new Set())
    setPersonalReady(false)
    if (!userId || !profileId || !db) { setPersonalReady(true); return undefined }
    const path = ['users', userId, 'profiles', profileId]
    const unsubscribePersonal = onSnapshot(collection(db, ...path, 'notifications'),
      (snapshot) => {
        setPersonal(snapshot.docs.map((entry) => ({ ...entry.data(), id: `profile:${entry.id}`, profileId, mode: 'inbox' })))
        setPersonalReady(true)
      }, () => { setError('Persönliche Mitteilungen konnten nicht geladen werden.'); setPersonalReady(true) })
    const unsubscribeReads = onSnapshot(collection(db, ...path, 'notificationReads'),
      (snapshot) => setPersonalReadIds(new Set(snapshot.docs.map((entry) => `profile:${entry.id}`))),
      () => setError('Persönlicher Lesestatus konnte nicht geladen werden.'))
    return () => { unsubscribePersonal(); unsubscribeReads() }
  }, [userId, profileId])

  const items = useMemo(() => [...announcements, ...personal.filter((item) => item.profileId === profileId)]
    .filter((item) => activeAnnouncement(item, now))
    .sort((a, b) => b.startsAt.toMillis() - a.startsAt.toMillis()), [announcements, personal, profileId, now])
  const readIds = useMemo(() => new Set([...globalReadIds, ...personalReadIds]), [globalReadIds, personalReadIds])
  const unreadCount = items.filter((item) => !readIds.has(item.id)).length

  async function markRead(id) {
    if (!userId || !items.some((item) => item.id === id)) return
    const personalId = id.startsWith('profile:') ? id.slice(8) : null
    const path = personalId
      ? ['users', userId, 'profiles', profileId, 'notificationReads', personalId]
      : ['users', userId, 'announcementReads', id]
    await setDoc(doc(db, ...path), { readAt: serverTimestamp() })
  }

  return { items, readIds, unreadCount, ready: announcementsReady && readsReady && personalReady, error, markRead }
}
