import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { loadCompleteTitleMetadata } from '../catalog/loadCompleteTitleMetadata.js'
import { isUsableTitle, mergeEnrichedTitle } from '../catalog/titleMetadata.js'
import { firebaseReady } from '../lib/firebase.js'
import {
  nativeTitleToFirestore,
  normalizePersonalTmdbTitle,
  tmdbCatalogKey,
} from './tmdbCatalogModel.js'
import { formatTmdbSyncSummary, mergeTmdbSyncDocuments } from './tmdbSyncMerge.js'

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

function canonicalGenreNames(detail, fallback = []) {
  if (Array.isArray(detail?.genreNames) && detail.genreNames.length) {
    return detail.genreNames.map((value) => String(value || '').trim()).filter(Boolean)
  }
  if (Array.isArray(detail?.genres) && detail.genres.length) {
    return detail.genres
      .map((genre) => typeof genre === 'string' ? genre : genre?.name)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  }
  return Array.isArray(fallback) ? fallback : []
}

function applyCanonicalMetadataToRaw(raw, detail) {
  const series = detail?.type === 'series' || detail?.mediaType === 'tv'
  return {
    ...raw,
    title: detail.title,
    originalTitle: detail.originalTitle || raw.originalTitle || detail.title,
    description: detail.description || raw.description || '',
    releaseDate: detail.releaseDate || raw.releaseDate || null,
    posterPath: detail.posterPath || raw.posterPath || null,
    backdropPath: detail.backdropPath || raw.backdropPath || null,
    artwork: detail.artwork || raw.artwork || null,
    collectionId: series ? null : detail.collectionId ?? raw.collectionId ?? null,
    collectionName: series ? null : detail.collectionName || raw.collectionName || null,
    collectionChecked: series ? null : detail.collectionChecked === true || raw.collectionChecked === true,
    collectionDetails: series ? null : detail.collectionDetails || raw.collectionDetails || null,
    metadataVersion: Math.max(Number(detail.metadataVersion) || 0, Number(raw.metadataVersion) || 0, 1),
    metadataComplete: detail.metadataComplete === true,
    metadataUpdatedAt: detail.metadataUpdatedAt || raw.metadataUpdatedAt || raw.syncedAt || null,
    originalLanguage: detail.originalLanguage || raw.originalLanguage || null,
    voteAverage: Number.isFinite(Number(detail.voteAverage)) ? Number(detail.voteAverage) : raw.voteAverage,
    voteCount: Number.isFinite(Number(detail.voteCount)) ? Number(detail.voteCount) : raw.voteCount,
    genreNames: canonicalGenreNames(detail, raw.genreNames),
    providerIds: Array.isArray(detail.providerIds) ? detail.providerIds : raw.providerIds,
    ageRating: detail.ageRating ?? raw.ageRating ?? null,
  }
}

async function repairRawPersonalTitle(raw) {
  const normalized = normalizePersonalTmdbTitle(raw)
  if (isUsableTitle(normalized.title)) return raw

  try {
    const detail = await loadCompleteTitleMetadata(normalized)
    if (!isUsableTitle(detail?.title)) return raw
    return applyCanonicalMetadataToRaw(raw, detail)
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
  const incomingDocuments = []

  for (const raw of Array.isArray(payload.titles) ? payload.titles : []) {
    const key = tmdbCatalogKey(raw)
    if (!key) continue
    const repaired = await repairRawPersonalTitle(raw)
    incomingDocuments.push({ id: key, ...nativeTitleToFirestore(repaired, syncedAt) })
  }

  const currentDocuments = current.docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }))
  const merged = mergeTmdbSyncDocuments(currentDocuments, incomingDocuments, payload.sections)
  const nextIds = new Set(merged.documents.map((item) => item.id))
  const operations = []

  for (const snapshot of current.docs) {
    if (!nextIds.has(snapshot.id)) operations.push({ type: 'delete', ref: snapshot.ref })
  }
  for (const item of merged.documents) {
    const { id, ...data } = item
    operations.push({ type: 'set', ref: doc(catalogRef, id), data })
  }
  await commitOperations(db, operations)

  const account = payload.account || {}
  const persistedSections = merged.sections.map((section) => ({
    id: section.id,
    label: section.label,
    ok: section.ok,
    count: section.count,
    retried: section.retried,
    preserved: section.preserved,
    error: section.error,
  }))
  await setDoc(doc(db, 'users', userId, 'tmdbSync', 'state'), {
    syncedAt,
    accountId: Number.isFinite(Number(account.id)) ? Number(account.id) : null,
    accountUsername: account.username || null,
    accountName: account.name || null,
    favoriteCount: merged.counts.favorite,
    watchlistCount: merged.counts.watchlist,
    ratingCount: merged.counts.rated,
    totalCount: merged.counts.total,
    partial: merged.partial,
    successfulSections: merged.successfulSections,
    totalSections: merged.totalSections,
    sections: persistedSections,
  })

  return {
    syncedAt,
    favoriteCount: merged.counts.favorite,
    watchlistCount: merged.counts.watchlist,
    ratingCount: merged.counts.rated,
    totalCount: merged.counts.total,
    partial: merged.partial,
    successfulSections: merged.successfulSections,
    totalSections: merged.totalSections,
    sections: persistedSections,
  }
}

function firestoreTitleRepairPatch(repaired) {
  const patch = {
    title: repaired.title,
    metadataVersion: Math.max(1, Number(repaired.metadataVersion) || 1),
    metadataComplete: repaired.metadataComplete === true,
    metadataUpdatedAt: repaired.metadataUpdatedAt || repaired.syncedAt || new Date().toISOString(),
  }
  if (isUsableTitle(repaired.originalTitle)) patch.originalTitle = repaired.originalTitle
  if (typeof repaired.description === 'string') patch.description = repaired.description
  if (typeof repaired.releaseDate === 'string' && repaired.releaseDate.trim()) patch.releaseDate = repaired.releaseDate
  if (typeof repaired.posterPath === 'string' && repaired.posterPath) patch.posterPath = repaired.posterPath
  if (typeof repaired.backdropPath === 'string' && repaired.backdropPath) patch.backdropPath = repaired.backdropPath
  if (repaired.artwork && typeof repaired.artwork === 'object') patch.artwork = repaired.artwork
  if (typeof repaired.originalLanguage === 'string' && repaired.originalLanguage) patch.originalLanguage = repaired.originalLanguage
  if (Number.isFinite(Number(repaired.voteAverage))) patch.voteAverage = Number(repaired.voteAverage)
  if (Number.isFinite(Number(repaired.voteCount))) patch.voteCount = Number(repaired.voteCount)
  if (Number.isFinite(Number(repaired.ageRating))) patch.ageRating = Number(repaired.ageRating)
  if (Array.isArray(repaired.genreNames)) patch.genreNames = repaired.genreNames
  if (Array.isArray(repaired.providerIds)) patch.providerIds = repaired.providerIds
  if (repaired.type !== 'series') {
    patch.collectionId = repaired.collectionId ?? null
    patch.collectionName = repaired.collectionName || null
    patch.collectionChecked = repaired.collectionChecked === true
    patch.collectionDetails = repaired.collectionDetails || null
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
  const activeUidRef = useRef(null)

  useEffect(() => {
    activeUidRef.current = user?.uid || null
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
    if (!user?.uid) return

    const candidates = normalizedDocuments
      .filter((item) => !isUsableTitle(item.title))
      .filter((item) => {
        const key = tmdbCatalogKey(item)
        const token = key ? `${user.uid}:${key}` : null
        return token && !repairInFlightRef.current.has(token)
      })
      .slice(0, PLACEHOLDER_REPAIR_LIMIT)

    for (const item of candidates) {
      const key = tmdbCatalogKey(item)
      const token = `${user.uid}:${key}`
      repairInFlightRef.current.add(token)

      loadCompleteTitleMetadata(item)
        .then(async (detail) => {
          if (!isUsableTitle(detail?.title) || activeUidRef.current !== user.uid) return
          const repaired = mergeEnrichedTitle(item, detail)
          setMetadataRepairs((current) => ({ ...current, [key]: repaired }))

          const { db } = await firebaseReady
          if (activeUidRef.current !== user.uid) return
          await setDoc(
            doc(db, 'users', user.uid, 'tmdbCatalog', key),
            firestoreTitleRepairPatch(repaired),
            { merge: true },
          )
        })
        .catch((nextError) => {
          console.warn(`TMDB-Platzhaltertitel ${key} konnte nicht automatisch repariert werden.`, nextError)
        })
        .finally(() => repairInFlightRef.current.delete(token))
    }
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
        const sectionSummary = formatTmdbSyncSummary(payload.sections)
        setSyncMessage(sectionSummary || `Synchronisiert: ${result.favoriteCount} Favoriten · ${result.watchlistCount} Watchlist-Titel · ${result.ratingCount} Bewertungen.`)
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
