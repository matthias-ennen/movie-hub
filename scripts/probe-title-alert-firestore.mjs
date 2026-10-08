import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * A bounded, disposable production IAM probe. Uses the same Admin SDK / WIF
 * credentials as check-title-alerts, but never touches a user or a real watch.
 */
export async function probeTitleAlertFirestore(db, { probeId = randomUUID(), now = new Date() } = {}) {
  if (!db || !/^[0-9a-f-]{36}$/i.test(probeId)) throw new Error('Valid Firestore and probe ID required.')
  const ref = db.collection('movieHubDiagnostics').doc(`title-alert-${probeId}`)
  let committed = false
  try {
    await db.runTransaction(async (transaction) => {
      const old = await transaction.get(ref)
      if (old.exists) throw new Error('Diagnostic probe already exists.')
      transaction.create(ref, { kind: 'title-alert-iam-probe', schemaVersion: 1, createdAt: now })
    })
    committed = true
    const persisted = await ref.get()
    if (!persisted.exists || persisted.data()?.kind !== 'title-alert-iam-probe') {
      throw new Error('Firestore IAM probe could not read back the transaction.')
    }
    return { transaction: 'passed', readback: 'passed', cleanup: 'pending' }
  } finally {
    if (committed) await ref.delete()
  }
}

async function main() {
  const [{ applicationDefault, deleteApp, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/firestore'),
  ])
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'movie-hub-62459',
  }, 'title-alert-iam-probe')
  try {
    const result = await probeTitleAlertFirestore(getFirestore(app))
    console.log(JSON.stringify({ ...result, cleanup: 'passed', watchesModified: 0 }))
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
