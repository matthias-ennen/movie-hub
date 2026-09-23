import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

function activeAnnouncement(item, now) {
  const start = item.startsAt?.toMillis?.()
  const end = item.expiresAt?.toMillis?.()
  return item.schemaVersion === 1 && item.status === 'published'
    && ['inbox', 'startup'].includes(item.mode)
    && typeof item.title === 'string' && typeof item.body === 'string'
    && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end
}

export function useAnnouncements(userId) {
  const [announcements, setAnnouncements] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [announcementsReady, setAnnouncementsReady] = useState(false)
  const [readsReady, setReadsReady] = useState(false)
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
      (snapshot) => { setReadIds(new Set(snapshot.docs.map((entry) => entry.id))); setReadsReady(true) },
      () => { setError('Lesestatus konnte nicht geladen werden.'); setReadsReady(true) },
    )
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { unsubscribeAnnouncements(); unsubscribeReads(); window.clearInterval(clock) }
  }, [userId])

  const items = useMemo(() => announcements.filter((item) => activeAnnouncement(item, now))
    .sort((a, b) => b.startsAt.toMillis() - a.startsAt.toMillis()), [announcements, now])
  const unreadCount = items.filter((item) => !readIds.has(item.id)).length

  async function markRead(id) {
    if (!userId || !items.some((item) => item.id === id)) return
    await setDoc(doc(db, 'users', userId, 'announcementReads', id), { readAt: serverTimestamp() })
  }

  return { items, readIds, unreadCount, ready: announcementsReady && readsReady, error, markRead }
}
