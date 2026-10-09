import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { normalizeTmdbWatchProviders } from '../src/services/tmdb.js'
import { isActiveTitleWatch, personalHardExpiry } from '../src/notifications/titleAlertLifecycleModel.js'
import { PROVIDER_REGISTRY } from '../src/providers/providerRegistry.js'
import { normalizeStoredProviderSelection } from '../src/settings/providerSelectionModel.js'
import {
  alertNotificationId, alertTitleKey, dueTvAiring, filterEnabledTvAirings, includedProviderIds,
  includedTransition, tvAiringId, tvMessage, tvTransition, watchId,
} from '../src/notifications/titleAlertModel.js'

const MAX_WATCHES = 500
const providerLabels = new Map(PROVIDER_REGISTRY.map((provider) => [provider.id, provider.label]))

function parseWatchSnapshot(snapshot) {
  const segments = snapshot.ref.path.split('/')
  const data = snapshot.data()
  if (segments.length !== 6 || segments[0] !== 'users' || segments[2] !== 'profiles'
    || segments[4] !== 'titleAlerts' || ![1, 2].includes(data?.schemaVersion)
    || !isActiveTitleWatch(data)
    || !watchId(data, data.kind) || segments[5] !== watchId(data, data.kind)
    || !/^[a-zA-Z0-9-]{1,80}$/.test(data.activationId || '')) return null
  return { snapshot, userId: segments[1], profileId: segments[3], watch: data }
}

export async function fetchWatchOffers(watch, token, fetchImpl = fetch) {
  const type = watch.type === 'series' ? 'tv' : 'movie'
  const response = await fetchImpl(`https://api.themoviedb.org/3/${type}/${watch.tmdbId}/watch/providers`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`TMDB provider check failed: HTTP ${response.status}`)
  return normalizeTmdbWatchProviders(await response.json(), 'DE').providerOffers
}

async function readPublishedTvSource({
  indexPath,
  titlesPath,
  indexKind,
  titlesKind,
  read,
  now,
}) {
  try {
    const [index, titles] = await Promise.all([
      read(indexPath, 'utf8').then(JSON.parse),
      read(titlesPath, 'utf8').then(JSON.parse),
    ])
    const generatedAt = Date.parse(index?.generatedAt)
    if (index?.kind !== indexKind || index?.status !== 'complete'
      || titles?.kind !== titlesKind || !Array.isArray(titles.entries)
      || !Number.isFinite(generatedAt) || Math.abs(now - generatedAt) > 48 * 3600000) {
      return null
    }
    return titles.entries
  } catch {
    return null
  }
}

export async function readPublishedTvEntries({ read = readFile, now = Date.now() } = {}) {
  const [waipuEntries, joynEntries] = await Promise.all([
    readPublishedTvSource({
      indexPath: 'public/waipu-live/index.json',
      titlesPath: 'public/waipu-live/titles.json',
      indexKind: 'waipu-live-index',
      titlesKind: 'waipu-live-titles',
      read,
      now,
    }),
    readPublishedTvSource({
      indexPath: 'public/joyn-live/index.json',
      titlesPath: 'public/joyn-live/titles.json',
      indexKind: 'joyn-live-index',
      titlesKind: 'joyn-live-titles',
      read,
      now,
    }),
  ])

  if (!waipuEntries && !joynEntries) {
    throw new Error('No recent, complete TV generation is available; TV alerts were skipped.')
  }

  const merged = new Map()
  for (const entry of [...(waipuEntries || []), ...(joynEntries || [])]) {
    const key = alertTitleKey(entry)
    if (!key) continue
    const current = merged.get(key)
    merged.set(key, {
      ...(current || entry),
      ...entry,
      airings: [
        ...(Array.isArray(current?.airings) ? current.airings : []),
        ...(Array.isArray(entry?.airings) ? entry.airings : []),
      ].sort((a, b) => String(a?.startTime || '').localeCompare(String(b?.startTime || ''))),
    })
  }
  return merged
}

function notification(watch, kind, body, now, expiresAt) {
  return {
    schemaVersion: 1, kind, titleType: watch.type, tmdbId: watch.tmdbId,
    mediaTitle: watch.title, title: kind === 'tv' ? 'Bald im TV' : 'Jetzt inklusive',
    body, startsAt: new Date(now), expiresAt: new Date(expiresAt),
  }
}

async function storeIncluded(db, entry, account, offers, now) {
  const { snapshot, watch } = entry
  const enabled = normalizeStoredProviderSelection(
    account?.providerSettings?.enabledProviderIds, account?.providerSettings?.version,
  ).enabledProviderIds
  const providerFingerprint = [...enabled].sort().join(',')
  const availableProviders = includedProviderIds(offers, enabled)
  const available = availableProviders.length > 0
  const parent = snapshot.ref.parent.parent
  const stateRef = parent.collection('titleAlertState').doc(snapshot.id)
  // An included observation is one-shot. Never generate return-N events.
  const eventId = alertNotificationId(watch, 'initial')
  const eventRef = parent.collection('notifications').doc(eventId)
  return db.runTransaction(async (transaction) => {
    // All reads precede writes: clients may have created the initial event.
    const [current, oldState, existingEvent] = await Promise.all([
      transaction.get(snapshot.ref), transaction.get(stateRef), transaction.get(eventRef),
    ])
    if (!current.exists || current.data().activationId !== watch.activationId
      || !isActiveTitleWatch(current.data())) return false

    const next = includedTransition(oldState.data(), watch.activationId, available, providerFingerprint)
    const shouldCreate = available && next.send && !existingEvent.exists
    if (!shouldCreate && !existingEvent.exists) {
      transaction.set(stateRef, { ...next, updatedAt: new Date(now) })
      return false
    }

    const finishedAt = new Date(now)
    if (shouldCreate) {
      const names = availableProviders.map((id) => providerLabels.get(id) || id).join(', ')
      transaction.create(eventRef, {
        ...notification(watch, 'included',
          `${watch.title} ist ohne Aufpreis bei ${names} verfügbar.`, now, now + 30 * 86400000),
        schemaVersion: 2, phase: 'included-found', eventAt: finishedAt, completedAt: finishedAt,
      })
    } else if (!existingEvent.data()?.completedAt) {
      // Existing V1 client-first events also complete their watch; keep the
      // original message ID/text/deadline instead of re-emitting anything.
      transaction.update(eventRef, { schemaVersion: 2, phase: 'included-found', completedAt: finishedAt })
    }
    transaction.set(stateRef, {
      ...next, activationId: watch.activationId, status: 'completed',
      completedAt: finishedAt, updatedAt: finishedAt,
    })
    // Admin SDK's existing custom IAM role supports update; no delete needed.
    transaction.update(snapshot.ref, {
      schemaVersion: 2, status: 'completed', completedAt: finishedAt,
      completionNotificationId: eventId,
    })
    return shouldCreate
  })
}

async function storeTv(db, entry, account, tvTitles, now) {
  const { snapshot, watch } = entry
  const airings = filterEnabledTvAirings(tvTitles.get(alertTitleKey(watch))?.airings, account)
  const airing = dueTvAiring(airings, [], now)
  if (!airing) return false

  const parent = snapshot.ref.parent.parent
  const stateRef = parent.collection('titleAlertState').doc(snapshot.id)
  // One stable first-notice ID per activation, regardless of multiple airings
  // or an overlapping Waipu/Joyn broadcast.
  const initialId = alertNotificationId(watch, 'initial')
  const initialRef = parent.collection('notifications').doc(initialId)
  const legacyId = tvAiringId(watch, airing)
  const legacyRef = parent.collection('notifications').doc(legacyId)

  return db.runTransaction(async (transaction) => {
    // Read every reference before writes so concurrent client/server attempts
    // share one initial event and cannot overwrite a newer activation.
    const [current, oldState, existingInitial, existingLegacy] = await Promise.all([
      transaction.get(snapshot.ref), transaction.get(stateRef),
      transaction.get(initialRef), transaction.get(legacyRef),
    ])
    if (!current.exists || current.data().activationId !== watch.activationId
      || !isActiveTitleWatch(current.data())) return false

    const next = tvTransition(oldState.data(), watch.activationId, airing, now)
    if (!next.send) return false
    const existing = existingInitial.exists || existingLegacy.exists
    const firstId = existingInitial.exists ? initialId : existingLegacy.exists ? legacyId : initialId

    if (!existing) {
      transaction.create(initialRef, {
        ...notification(watch, 'tv', tvMessage(airing, watch.title), now,
          personalHardExpiry('tv', {
            createdAt: now, airingEndsAt: airing.stopTime,
          }).getTime()),
        schemaVersion: 2, phase: 'tv-found', eventAt: new Date(now),
        airingStartAt: new Date(airing.startTime),
        ...(Number.isFinite(Date.parse(airing.stopTime)) ? { airingEndsAt: new Date(airing.stopTime) } : {}),
        stationName: String(airing.stationName || ''),
      })
    }

    const recordedStart = existingInitial.exists && existingInitial.data()?.airingStartAt
      ? existingInitial.data().airingStartAt.toDate?.() || existingInitial.data().airingStartAt
      : new Date(airing.startTime)
    const firstStartMs = recordedStart instanceof Date ? recordedStart.getTime() : Date.parse(recordedStart)
    transaction.set(stateRef, {
      ...next, firstNotificationId: firstId,
      // Preserve the exact client-committed first airing rather than silently
      // rescheduling its five-minute follow-up to a different broadcast.
      ...(Number.isFinite(firstStartMs)
        ? { firstAiringStart: new Date(firstStartMs).toISOString(),
            finalReminderAt: new Date(firstStartMs - 5 * 60 * 1000) } : {}),
      updatedAt: new Date(now),
    })
    return !existing
  })
}

function snapshotMatchesWatch(entry, onlyWatchId) {
  return entry.snapshot.id === onlyWatchId
}

export async function runTitleAlertCheck({ db, token, now = Date.now(), fetchImpl = fetch, tvTitles = null, onlyWatchId = null } = {}) {
  if (!db || !token) throw new Error('Firestore and TMDB server credentials are required.')
  const users = await db.collection('users').get()
  const accounts = new Map(users.docs.map((doc) => [doc.id, doc.data() || {}]))
  const entries = []
  for (const user of users.docs) {
    const profiles = await user.ref.collection('profiles').get()
    for (const profile of profiles.docs) {
      const watches = await profile.ref.collection('titleAlerts').get()
      for (const watch of watches.docs) {
        const parsed = parseWatchSnapshot(watch)
        if (parsed && (!onlyWatchId || snapshotMatchesWatch(parsed, onlyWatchId))) entries.push(parsed)
        if (entries.length > MAX_WATCHES) throw new Error('Title-alert watch limit exceeded; no partial run was started.')
      }
    }
  }
  const needsTv = entries.some((entry) => entry.watch.kind === 'tv')
  let publishedTv = tvTitles || new Map()
  let tvUnavailable = false
  if (needsTv && !tvTitles) {
    try { publishedTv = await readPublishedTvEntries({ now }) }
    catch (error) { console.warn(error.message); tvUnavailable = true }
  }
  const offers = new Map()
  const result = { observed: entries.length, includedCreated: 0, tvCreated: 0, failed: 0 }

  for (const entry of entries) {
    try {
      if (entry.watch.kind === 'included') {
        const key = alertTitleKey(entry.watch)
        if (!offers.has(key)) offers.set(key, await fetchWatchOffers(entry.watch, token, fetchImpl))
        result.includedCreated += Number(await storeIncluded(db, entry, accounts.get(entry.userId), offers.get(key), now))
      } else {
        if (tvUnavailable) { result.failed++; continue }
        result.tvCreated += Number(await storeTv(db, entry, accounts.get(entry.userId), publishedTv, now))
      }
    } catch (error) {
      result.failed++
      console.warn(`Title-alert check failed (${entry.watch.kind}): ${error.message}`)
    }
  }
  if (result.failed) throw new Error(`Title-alert check failed for ${result.failed} of ${result.observed} watches.`)
  return result
}

async function main() {
  const token = process.env.TMDB_API_READ_TOKEN
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'movie-hub-62459'
  if (!token) throw new Error('TMDB_API_READ_TOKEN is required.')
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId })
  const result = await runTitleAlertCheck({ db: getFirestore(app), token })
  console.log(JSON.stringify(result))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
