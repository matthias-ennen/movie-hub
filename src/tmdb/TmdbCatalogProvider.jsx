import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import {
  nativeTitleToFirestore,
  normalizePersonalTmdbTitle,
  tmdbCatalogKey,
} from './tmdbCatalogModel.js'

const TmdbCatalogContext = createContext(null)
const BATCH_SIZE = 400

function parseNativePayload(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') throw new Error('Movie Hub hat keine gültigen TMDB-Daten erhalten.')
  return JSON.parse(value)
}

async function commitOperations(db, operations) {
  for (let offset = 0; offset < operations.length; offset += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const operation of operations.slice(offset, offset + BATCH_SIZE)) {
      if (operation.type === 'delete') batch.delete(operation.ref)
      else batch.set(operation.ref, operation.data)
    }
    await batch.commit()
  }
}

async function replaceTmdbCatalog(userId, payload) {
  const { db } = await firebaseReady
  const catalogRef = collection(db, 'users', userId, 'tmdbCatalog')
  const current = await getDocs(catalogRef)
  const syncedAt = payload.syncedAt || new Date().toISOString()
  const incoming = new Map()

  for (const raw of Array.isArray(payload.titles) ? payload.titles : []) {
    const key = tmdbCatalogKey(raw)
    if (!key) continue
    incoming.set(key, nativeTitleToFirestore(raw, syncedAt))
  }

  const operations = []
  for (const snapshot of current.docs) {
    if (!incoming.has(snapshot.id)) operations.push({ type: 'delete', ref: snapshot.ref })
  }
  for (const [key, data] of incoming) {
    operations.push({ type: 'set', ref: doc(catalogRef, key), data })
  }
  await commitOperations(db, operations)

  const counts = payload.counts || {}
  const account = payload.account || {}
  await setDoc(doc(db, 'users', userId, 'tmdbSync', 'state'), {
    syncedAt,
    accountId: Number.isFinite(Number(account.id)) ? Number(account.id) : null,
    accountUsername: account.username || null,
    accountName: account.name || null,
    favoriteCount: Number.isFinite(Number(counts.favorite)) ? Number(counts.favorite) : 0,
    watchlistCount: Number.isFinite(Number(counts.watchlist)) ? Number(counts.watchlist) : 0,
    totalCount: incoming.size,
  })

  return {
    syncedAt,
    favoriteCount: Number(counts.favorite) || 0,
    watchlistCount: Number(counts.watchlist) || 0,
    totalCount: incoming.size,
  }
}

export function TmdbCatalogProvider({ user, children }) {
  const [documents, setDocuments] = useState([])
  const [syncState, setSyncState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    if (!user?.uid) {
      setDocuments([])
      setSyncState(null)
      setLoading(false)
      return undefined
    }

    let disposed = false
    let unsubscribeCatalog = () => {}
    let unsubscribeState = () => {}

    firebaseReady.then(({ db }) => {
      if (disposed) return
      unsubscribeCatalog = onSnapshot(
        collection(db, 'users', user.uid, 'tmdbCatalog'),
        (snapshot) => {
          setDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
          setError(null)
          setLoading(false)
        },
        (nextError) => {
          setError(nextError)
          setLoading(false)
        },
      )
      unsubscribeState = onSnapshot(
        doc(db, 'users', user.uid, 'tmdbSync', 'state'),
        (snapshot) => setSyncState(snapshot.exists() ? snapshot.data() : null),
        (nextError) => setError(nextError),
      )
    }).catch((nextError) => {
      if (!disposed) {
        setError(nextError)
        setLoading(false)
      }
    })

    return () => {
      disposed = true
      unsubscribeCatalog()
      unsubscribeState()
    }
  }, [user?.uid])

  const personalTitles = useMemo(() => documents.map((item) => normalizePersonalTmdbTitle({
    ...item,
    favorite: item.favorite,
    watchlist: item.watchlist,
  })), [documents])

  useEffect(() => {
    if (!user?.uid) return undefined
    const previous = window.__movieHubTmdbSyncResult

    window.__movieHubTmdbSyncResult = async (rawPayload) => {
      setSyncBusy(true)
      setSyncMessage('TMDB-Daten werden in Movie Hub gespeichert …')
      try {
        const payload = parseNativePayload(rawPayload)
        if (!payload.ok) throw new Error(payload.error || 'TMDB-Synchronisierung fehlgeschlagen.')
        const result = await replaceTmdbCatalog(user.uid, payload)
        setSyncMessage(`Synchronisiert: ${result.favoriteCount} Favoriten · ${result.watchlistCount} Watchlist-Titel.`)
      } catch (nextError) {
        setSyncMessage(nextError instanceof Error ? nextError.message : 'TMDB-Synchronisierung fehlgeschlagen.')
      } finally {
        setSyncBusy(false)
      }
    }

    return () => {
      if (window.__movieHubTmdbSyncResult) {
        if (previous) window.__movieHubTmdbSyncResult = previous
        else delete window.__movieHubTmdbSyncResult
      }
    }
  }, [user?.uid])

  const requestSync = useCallback(() => {
    if (typeof window.MovieHubNative?.requestTmdbCatalogSync !== 'function') {
      setSyncMessage('Die Synchronisierung kann nur in der Android-/Fire-TV-App gestartet werden.')
      return
    }
    setSyncBusy(true)
    setSyncMessage('Favoriten und Watchlist werden von TMDB geladen …')
    try {
      window.MovieHubNative.requestTmdbCatalogSync()
    } catch (nextError) {
      setSyncBusy(false)
      setSyncMessage(nextError instanceof Error ? nextError.message : 'Synchronisierung konnte nicht gestartet werden.')
    }
  }, [])

  const value = useMemo(() => ({
    personalTitles,
    syncState,
    loading,
    error,
    syncBusy,
    syncMessage,
    requestSync,
    nativeSyncAvailable: typeof window.MovieHubNative?.requestTmdbCatalogSync === 'function',
  }), [personalTitles, syncState, loading, error, syncBusy, syncMessage, requestSync])

  return <TmdbCatalogContext.Provider value={value}>{children}</TmdbCatalogContext.Provider>
}

export function useTmdbCatalog() {
  const value = useContext(TmdbCatalogContext)
  if (!value) throw new Error('useTmdbCatalog must be used inside TmdbCatalogProvider')
  return value
}
