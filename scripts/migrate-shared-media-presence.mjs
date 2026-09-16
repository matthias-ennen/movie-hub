import { fileURLToPath } from 'node:url'
import { buildSharedMediaTitleRef } from '../src/library/sharedMediaCatalogModel.js'

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'movie-hub-62459'

export function parseSharedMediaEntryPath(path) {
  const segments = String(path || '').split('/').filter(Boolean)
  if (
    segments.length !== 6
    || segments[0] !== 'users'
    || segments[2] !== 'sharedMedia'
    || segments[4] !== 'entries'
  ) {
    return null
  }
  return {
    userId: segments[1],
    titleKey: segments[3],
    entryId: segments[5],
    parentPath: segments.slice(0, 4).join('/'),
  }
}

function usableTitleRef(value) {
  const ref = buildSharedMediaTitleRef(value)
  if (!ref.title || (!ref.id && ref.tmdbId === null)) return null
  return ref
}

export async function migrateSharedMediaPresenceParents({ db, now = new Date() } = {}) {
  if (!db) throw new Error('Firestore Admin client is missing.')

  const source = await db.collectionGroup('entries').get()
  const groups = new Map()

  for (const snapshot of source.docs) {
    const parsed = parseSharedMediaEntryPath(snapshot.ref.path)
    if (!parsed) continue
    const current = groups.get(parsed.parentPath) || {
      parentRef: snapshot.ref.parent.parent,
      titleRef: null,
      entryCount: 0,
    }
    current.entryCount += 1
    current.titleRef ||= usableTitleRef(snapshot.data()?.titleRef)
    groups.set(parsed.parentPath, current)
  }

  const candidates = [...groups.values()]
  const parentSnapshots = candidates.length
    ? await db.getAll(...candidates.map((candidate) => candidate.parentRef))
    : []

  let created = 0
  let repaired = 0
  let unchanged = 0
  let unresolved = 0

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    const parentSnapshot = parentSnapshots[index]
    const data = parentSnapshot?.data?.() || null

    if (parentSnapshot?.exists && data?.hasMedia === true && usableTitleRef(data?.titleRef)) {
      unchanged += 1
      continue
    }

    const titleRef = usableTitleRef(data?.titleRef) || candidate.titleRef
    if (!titleRef) {
      unresolved += 1
      console.warn(`Movie-Hub legacy parent could not be reconstructed: ${candidate.parentRef.path}`)
      continue
    }

    await candidate.parentRef.set({
      hasMedia: true,
      titleRef,
      updatedAt: now,
    }, { merge: true })

    if (parentSnapshot?.exists) repaired += 1
    else created += 1
  }

  return {
    scannedEntries: source.size,
    parentGroups: candidates.length,
    created,
    repaired,
    unchanged,
    unresolved,
  }
}

async function main() {
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId })
  const result = await migrateSharedMediaPresenceParents({ db: getFirestore(app) })
  console.log(
    `Movie-Hub presence migration: scanned ${result.scannedEntries} entries, `
    + `${result.parentGroups} parents, created ${result.created}, repaired ${result.repaired}, `
    + `unchanged ${result.unchanged}, unresolved ${result.unresolved}.`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
