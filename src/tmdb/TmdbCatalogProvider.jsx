import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { isUsableTitle, mergeEnrichedTitle } from '../catalog/titleMetadata.js'
import { firebaseReady } from '../lib/firebase.js'
import { loadSearchDetail } from '../search/lazySearchDetails.js'
import {
  nativeTitleToFirestore,
  normalizePersonalTmdbTitle,
  tmdbCatalogKey,
} from './tmdbCatalogModel.js'

const TmdbCatalogContext = createContext(null)
const BATCH_SIZE = 400
const PLACEHOLDER_REPAIR_LIMIT = 20

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

async function repairRawPersonalTitle(raw) {
  const normalized = normalizePersonalTmdbTitle(raw)
  if (isUsableTitle(normalized.title)) return raw

  try {
    const detail = await loadSearchDetail(normalized)
    if (!isUsableTitle(detail?.title)) return raw
    return {
      ...raw,
      title: detail.title,
      originalTitle: detail.originalTitle || raw.originalTitle || detail.title,
      description: detail.description || raw.description || '',
      releaseDate: detail.releaseDate || raw.releaseDate || null,
      posterPath: detail.posterPath || raw.posterPath || null,
      backdropPath: detail.backdropPath || raw.backdropPath || null,
    }
  } catch (error) {
    console.warn(`TMDB-Titel ${normalized.tmdbId} konnte vor dem Speichern nicht aufgelöst werden.`, error)
    return raw
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
    const repaired = await repairRawPersonalTitle(raw)
    incoming.set(key, nativeTitleToFirestore(repaired, syncedAt))
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
    ratingCount: Number.isFinite(Number(counts.rated)) ? Number(counts.rated) : 0,
    totalCount: incoming.size,
  })

  return {
    syncedAt,
    favoriteCount: Number(counts.favorite) || 0,
    watchlistCount: Number(counts.watchlist) || 0,
    ratingCount: Number(counts.rated) || 0,
    totalCount: incoming.size,
  }
}

function firestoreTitleRepairPatch(repaired) {
  const patch = { title: repaired.title }
  if (isUsableTitle(repaired.originalTitle)) patch.originalTitle = repaired.originalTitle
  if (typeof repaired.description === 'string' && repaired.description.trim()) {
    patch.description = repaired.description
  }
  if (typeof repaired.releaseDate === 'string' && repaired.releaseDate.trim()) {
    patch.releaseDate = repaired.releaseDate
  }
  if (typeof repaired.posterPath === 'string' && repaired.posterPath) {
    patch.posterPath = repaired.posterPath
  }
  if (typeof repaired.backdropPath === 'string' && repaired.backdropPath) {
    patch.backdropPath = repaired.backdropPath
  }
  return patch
}

export function TmdbCatalogProvider({ user, children }) {
  const [documents, setDocuments] = useState([])
  const [syncState, setSyncState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [metadataRepairs, setMetadataRepairs] = useState({})
  const repairInFlightRef = useRef(new Set())

  useEffect(() => {
    setMetadataRepairs({})
    repairInFlightRef.current.clear()

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

  const normalizedDocuments = useMemo(
    () => documents.map((item) => normalizePersonalTmdbTitle(item)),
    [documents],
  )

  const personalTitles = useMemo(() => normalizedDocuments.map((item) => {
    const key = tmdbCatalogKey(item)
    const repair = key ? metadataRepairs[key] : null
    return repair ? mergeEnrichedTitle(item, repair) : item
  }), [normalizedDocuments, metadataRepairs])

  useEffect(() => {
    if (!user?.uid) return undefined

    const candidates = normalizedDocuments
      .filter((item) => !isUsableTitle(item.title))
      .filter((item) => {
        const key = tmdbCatalogKey(item)
        return key && !repairInFlightRef.current.has(key)
      })
      .slice(0, PLACEHOLDER_REPAIR_LIMIT)

    if (!candidates.length) return undefined
    let disposed = false

    for (const item of candidates) {
      const key = tmdbCatalogKey(item)
      repairInFlightRef.current.add(key)

      loadSearchDetail(item)
        .then(async (detail) => {
          if (!isUsableTitle(detail?.title) || disposed) return
          const repaired = mergeEnrichedTitle(item, detail)
          setMetadataRepairs((current) => ({ ...current, [key]: repaired }))

          const { db } = await firebaseReady
          if (disposed) return
          await setDoc(
            doc(db, 'users', user.uid, 'tmdbCatalog', key),
            firestoreTitleRepairPatch(repaired),
            { merge: true },
          )
        })
        .catch((nextError) => {
          console.warn(`TMDB-Platzhaltertitel ${key} konnte nicht automatisch repariert werden.`, nextError)
        })
        .finally(() => repairInFlightRef.current.delete(key))
    }

    return () => { disposed = true }
  }, [user?.uid, normalizedDocuments])

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
        setSyncMessage(`Synchronisiert: ${result.favoriteCount} Favoriten · ${result.watchlistCount} Watchlist-Titel · ${result.ratingCount} Bewertungen.`)
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
    setSyncMessage('Favoriten, Watchlist und Bewertungen werden von TMDB geladen …')
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
