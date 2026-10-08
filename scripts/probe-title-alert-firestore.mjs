import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Probes the same WIF/Admin SDK principal as check-title-alerts.
 * Firestore's default read-write runTransaction requires the permission
 * datastore.databases.get even when the transaction has zero mutations.
 * The randomly named diagnostic document is NOT created or changed.
 *
 * A passing probe proves transaction start and read permission only.
 * Actual notification create/update/dedup still needs an E2E watch test.
 */
export async function probeTitleAlertFirestore(db, { probeId = randomUUID() } = {}) {
  if (!db || !/^[0-9a-f-]{36}$/i.test(probeId)) throw new Error('Valid Firestore and probe ID required.')
  const ref = db.collection('movieHubDiagnostics').doc(`title-alert-${probeId}`)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists) throw new Error('Diagnostic probe path unexpectedly exists.')
    return { transaction: 'passed', readback: 'absent', mutations: 0 }
  })
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
    console.log(JSON.stringify({ ...result, userRecordsModified: 0, diagnosticRecordsModified: 0 }))
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
