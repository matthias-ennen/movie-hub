import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { normalizeTmdbWatchProviders } from '../src/services/tmdb.js'
import { PROVIDER_REGISTRY } from '../src/providers/providerRegistry.js'
import { normalizeStoredProviderSelection } from '../src/settings/providerSelectionModel.js'
import {
  alertNotificationId, alertTitleKey, dueTvAiring, includedProviderIds,
  includedTransition, tvAiringId, tvMessage, tvTransition, watchId,
} from '../src/notifications/titleAlertModel.js'

const MAX_WATCHES = 500
const providerLabels = new Map(PROVIDER_REGISTRY.map((provider) => [provider.id, provider.label]))

function parseWatchSnapshot(snapshot) {
  const segments = snapshot.ref.path.split('/')
  const data = snapshot.data()
  if (segments.length !== 6 || segments[0] !== 'users' || segments[2] !== 'profiles'
    || segments[4] !== 'titleAlerts' || data?.schemaVersion !== 1
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

export async function readPublishedTvEntries({ read = readFile, now = Date.now() } = {}) {
  const [index, titles] = await Promise.all([
    read('public/waipu-live/index.json', 'utf8').then(JSON.parse),
    read('public/waipu-live/titles.json', 'utf8').then(JSON.parse),
  ])
  const generatedAt = Date.parse(index?.generatedAt)
  if (index?.kind !== 'waipu-live-index' || index?.status !== 'complete'
    || titles?.kind !== 'waipu-live-titles' || !Array.isArray(titles.entries)
    || !Number.isFinite(generatedAt) || Math.abs(now - generatedAt) > 48 * 3600000) {
    throw new Error('No recent, complete TV generation is available; TV alerts were skipped.')
  }
  return new Map(titles.entries.map((entry) => [alertTitleKey(entry), entry]).filter(([key]) => key))
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
    account.providerSettings?.enabledProviderIds, account.providerSettings?.version,
  ).enabledProviderIds
  const providerFingerprint = [...enabled].sort().join(',')
  const availableProviders = includedProviderIds(offers, enabled)
  const available = availableProviders.length > 0
  const stateRef = snapshot.ref.parent.parent.collection('titleAlertState').doc(snapshot.id)
  return db.runTransaction(async (transaction) => {
    const [current, oldState] = await Promise.all([transaction.get(snapshot.ref), transaction.get(stateRef)])
    if (!current.exists || current.data().activationId !== watch.activationId) return false
    const next = includedTransition(oldState.data(), watch.activationId, available, providerFingerprint)
    let eventRef = null
    let existingEvent = null
    if (next.send) {
      const suffix = next.cycle ? `return-${next.cycle}` : 'initial'
      const eventId = alertNotificationId(watch, suffix)
      eventRef = snapshot.ref.parent.parent.collection('notifications').doc(eventId)
      existingEvent = await transaction.get(eventRef)
    }
    if (eventRef && !existingEvent.exists) {
      const names = availableProviders.map((id) => providerLabels.get(id) || id).join(', ')
      transaction.create(eventRef, notification(watch, 'included',
        `${watch.title} ist ohne Aufpreis bei ${names} verfügbar.`, now, now + 30 * 86400000))
    }
    transaction.set(stateRef, { ...next, updatedAt: new Date(now) })
    return Boolean(eventRef && !existingEvent.exists)
  })
}

async function storeTv(db, entry, account, tvTitles, now) {
  const { snapshot, watch } = entry
  const airings = tvTitles.get(alertTitleKey(watch))?.airings
  const airing = dueTvAiring(airings, account.waipuStationSettings?.disabledStationIds, now)
  if (!airing) return false
  const stateRef = snapshot.ref.parent.parent.collection('titleAlertState').doc(snapshot.id)
  return db.runTransaction(async (transaction) => {
    const [current, oldState] = await Promise.all([transaction.get(snapshot.ref), transaction.get(stateRef)])
    if (!current.exists || current.data().activationId !== watch.activationId) return false
    const next = tvTransition(oldState.data(), watch.activationId, airing, now)
    if (!next.send) return false
    const eventRef = snapshot.ref.parent.parent.collection('notifications').doc(tvAiringId(watch, airing))
    const existingEvent = await transaction.get(eventRef)
    if (!existingEvent.exists) {
      transaction.create(eventRef, notification(watch, 'tv',
        tvMessage(airing, watch.title), now, Date.parse(airing.stopTime)))
    }
    transaction.set(stateRef, {
      activationId: watch.activationId, lastAiringStart: airing.startTime,
      lastNotifiedAt: new Date(now),
    })
    return !existingEvent.exists
  })
}

export async function runTitleAlertCheck({ db, token, now = Date.now(), fetchImpl = fetch, tvTitles = null } = {}) {
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
        if (parsed) entries.push(parsed)
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
