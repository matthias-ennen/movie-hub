/**
 * The ONLY production playlist-source configuration for MovieHub YouTube G2.
 * Reads MovieHub Admin Firestore records with the existing GitHub deploy
 * service-account identity. No URL, playlist ID or offer kind is hardcoded.
 *
 * Missing/empty/partially modified config is fatal: never silently restore
 * legacy lists or interpret unavailable API results as video deletions.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const ADMIN_PLAYLIST_CONFIG_PATH = 'artifacts/youtube-g2/admin-playlist-config.json'
export const ADMIN_PLAYLIST_MODES = Object.freeze({
  free: ['free'], ads: ['ads'], flatrate: ['flatrate'],
  rent: ['rent'], buy: ['buy'], 'rent-buy': ['rent', 'buy'],
})
const ID = /^(?:PL|UU|OLAK5uy_)[A-Za-z0-9_-]{10,120}$/

export function validateAdminPlaylistSnapshot({ revision, rows, generatedAt = new Date().toISOString() }) {
  if (!Number.isSafeInteger(revision) || revision < 1
    || !Array.isArray(rows) || rows.length === 0
    || !Number.isFinite(Date.parse(generatedAt))) {
    throw Error('YOUTUBE_ADMIN_CONFIG_MISSING_OR_INVALID')
  }
  const sources = []
  const seen = new Set()
  for (const row of rows) {
    const playlistId = row.playlistId
    if (!ID.test(String(playlistId || '')) || seen.has(playlistId)
      || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100
      || !Object.hasOwn(ADMIN_PLAYLIST_MODES, row.offerKind)
      || !Array.isArray(row.offerTypes)
      || JSON.stringify(row.offerTypes) !== JSON.stringify(ADMIN_PLAYLIST_MODES[row.offerKind])
      || typeof row.enabled !== 'boolean'
      || row.schemaVersion !== 1) {
      throw Error('YOUTUBE_ADMIN_PLAYLIST_INVALID:' + String(playlistId).slice(0, 25))
    }
    seen.add(playlistId)
    if (row.enabled) sources.push({ playlistId, mode: row.offerKind, name: row.name })
  }
  if (!sources.length) throw Error('YOUTUBE_ADMIN_NO_ENABLED_PLAYLISTS')
  return Object.freeze({
    kind: 'moviehub-youtube-admin-playlist-snapshot', schemaVersion: 1,
    revision, generatedAt, allPlaylistCount: rows.length,
    sources: Object.freeze(sources.map(s => Object.freeze(s))),
  })
}

export async function readAdminPlaylistConfig({ db, now = () => new Date().toISOString() }) {
  const ref = db.collection('adapterConfigs').doc('youtube')
  const before = await ref.get()
  if (!before.exists) throw Error('YOUTUBE_ADMIN_CONFIG_NOT_INITIALIZED')
  const revision = before.data()?.revision
  if (!Number.isSafeInteger(revision) || revision < 1) throw Error('YOUTUBE_ADMIN_CONFIG_INVALID_REVISION')
  const rows = (await ref.collection('playlists').get()).docs
    .map(doc => ({ ...doc.data(), playlistId: doc.id }))
  const after = await ref.get()
  if (!after.exists || after.data()?.revision !== revision) {
    throw Error('YOUTUBE_ADMIN_CONFIG_CHANGED_DURING_READ')
  }
  return validateAdminPlaylistSnapshot({ revision, rows, generatedAt: now() })
}

export async function loadAdminPlaylistSnapshot(path = ADMIN_PLAYLIST_CONFIG_PATH, now = Date.now()) {
  const snapshot = JSON.parse(await readFile(path, 'utf8'))
  const validated = validateAdminPlaylistSnapshot({
    revision: snapshot.revision,
    rows: snapshot.sources.map(x => ({
      ...x, offerKind: x.mode, offerTypes: ADMIN_PLAYLIST_MODES[x.mode],
      enabled: true, schemaVersion: 1,
    })),
    generatedAt: snapshot.generatedAt,
  })
  if (snapshot.kind !== validated.kind || snapshot.schemaVersion !== 1
    || snapshot.allPlaylistCount < validated.sources.length
    || now - Date.parse(snapshot.generatedAt) > 3 * 3600_000
    || Date.parse(snapshot.generatedAt) - now > 60_000) {
    throw Error('YOUTUBE_ADMIN_SNAPSHOT_MISSING_STALE_OR_INVALID')
  }
  return { ...snapshot, sources: validated.sources }
}

async function main() {
  const { initializeApp, getApps } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  if (!getApps().length) initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'movie-hub-62459' })
  const snapshot = await readAdminPlaylistConfig({ db: getFirestore() })
  await mkdir('artifacts/youtube-g2', { recursive: true })
  await writeFile(ADMIN_PLAYLIST_CONFIG_PATH, JSON.stringify(snapshot) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ source: 'MovieHub Admin / Firestore',
    revision: snapshot.revision, configured: snapshot.allPlaylistCount,
    active: snapshot.sources.length, offerKinds: snapshot.sources.map(x => x.mode) }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('YouTube admin configuration failed closed: ' + error.message); process.exitCode = 1 })
}
