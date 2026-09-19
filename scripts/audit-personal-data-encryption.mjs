import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'movie-hub-62459'

export function isValidEncryptionEnvelope(value) {
  return Boolean(value
    && typeof value === 'object'
    && Number(value.cryptoVersion) === 1
    && value.algorithm === 'A256GCM'
    && typeof value.iv === 'string'
    && value.iv.length > 0
    && typeof value.ciphertext === 'string'
    && value.ciphertext.length > 0)
}

function emptyFieldSummary() {
  return {
    documents: 0,
    plaintextPresent: 0,
    encryptedPresent: 0,
    encryptedValid: 0,
    missingBoth: 0,
    invalidEncrypted: 0,
  }
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key)
}

function auditField({ data, plaintextName, encryptedName, required, path, summary, blockers }) {
  summary.documents++
  const plaintextPresent = own(data, plaintextName)
  const encryptedPresent = own(data, encryptedName)
  const encryptedValid = isValidEncryptionEnvelope(data?.[encryptedName])

  if (plaintextPresent) summary.plaintextPresent++
  if (encryptedPresent) summary.encryptedPresent++
  if (encryptedValid) summary.encryptedValid++
  if (!plaintextPresent && !encryptedPresent) summary.missingBoth++
  if (encryptedPresent && !encryptedValid) summary.invalidEncrypted++

  if (plaintextPresent && typeof data?.[plaintextName] !== 'string') {
    blockers.push({ path, field: plaintextName, reason: 'invalid_plaintext_type' })
  }
  if (encryptedPresent && !encryptedValid) {
    blockers.push({ path, field: encryptedName, reason: 'invalid_encryption_envelope' })
  }
  if (plaintextPresent && !encryptedValid) {
    blockers.push({ path, field: encryptedName, reason: 'missing_encrypted_counterpart' })
  }
  if (required && !plaintextPresent && !encryptedValid) {
    blockers.push({ path, field: plaintextName, reason: 'required_value_missing' })
  }
}

export async function resolveAuditUserId(db, configuredUserId = '') {
  const requested = String(configuredUserId || '').trim()
  if (requested) return requested

  const users = await db.collection('users').get()
  if (users.size !== 1) {
    throw new Error(`Audit requires exactly one user document or MOVIE_HUB_AUDIT_UID; found ${users.size}.`)
  }
  return users.docs[0].id
}

export async function auditPersonalDataEncryption({ db, userId } = {}) {
  if (!db) throw new Error('Firestore Admin client is missing.')
  if (!userId) throw new Error('Firestore user ID is missing.')

  const report = {
    schemaVersion: 1,
    status: 'checking',
    user: 'single-selected-user',
    profileDocuments: 0,
    titleDocuments: 0,
    sharedMediaDocuments: 0,
    sharedMediaEntries: 0,
    diagnostics: {
      exists: false,
      status: null,
      cryptoVersion: null,
      errorCount: null,
    },
    fields: {
      note: emptyFieldSummary(),
      label: emptyFieldSummary(),
      url: emptyFieldSummary(),
    },
    blockers: [],
  }

  const diagnostic = await db.doc(`users/${userId}/diagnostics/personal-data-encryption-v1`).get()
  if (diagnostic.exists) {
    const data = diagnostic.data() || {}
    report.diagnostics = {
      exists: true,
      status: data.status ?? null,
      cryptoVersion: data.cryptoVersion ?? null,
      errorCount: Array.isArray(data.errors) ? data.errors.length : null,
    }
  }

  const profiles = await db.collection(`users/${userId}/profiles`).get()
  report.profileDocuments = profiles.size
  for (const profile of profiles.docs) {
    const titles = await profile.ref.collection('titles').get()
    report.titleDocuments += titles.size
    for (const title of titles.docs) {
      auditField({
        data: title.data(),
        plaintextName: 'note',
        encryptedName: 'noteEncrypted',
        required: false,
        path: `profiles/${profile.id}/titles/${title.id}`,
        summary: report.fields.note,
        blockers: report.blockers,
      })
    }
  }

  const sharedMedia = await db.collection(`users/${userId}/sharedMedia`).get()
  report.sharedMediaDocuments = sharedMedia.size
  for (const parent of sharedMedia.docs) {
    const entries = await parent.ref.collection('entries').get()
    report.sharedMediaEntries += entries.size
    for (const entry of entries.docs) {
      for (const field of [
        ['label', 'labelEncrypted'],
        ['url', 'urlEncrypted'],
      ]) {
        auditField({
          data: entry.data(),
          plaintextName: field[0],
          encryptedName: field[1],
          required: true,
          path: `sharedMedia/${parent.id}/entries/${entry.id}`,
          summary: report.fields[field[0]],
          blockers: report.blockers,
        })
      }
    }
  }

  if (!report.diagnostics.exists) {
    report.blockers.push({ path: 'diagnostics/personal-data-encryption-v1', reason: 'migration_report_missing' })
  } else if (report.diagnostics.status !== 'complete' || report.diagnostics.errorCount !== 0) {
    report.blockers.push({ path: 'diagnostics/personal-data-encryption-v1', reason: 'migration_not_complete' })
  }

  const plaintextFields = Object.values(report.fields)
    .reduce((sum, field) => sum + field.plaintextPresent, 0)
  report.status = report.blockers.length
    ? 'blocked'
    : plaintextFields === 0
      ? 'plaintext_free'
      : 'ready_for_plaintext_cleanup'
  report.plaintextFieldCount = plaintextFields
  report.encryptedFieldCount = Object.values(report.fields)
    .reduce((sum, field) => sum + field.encryptedValid, 0)
  return report
}

async function main() {
  const [{ applicationDefault, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId })
  const db = getFirestore(app)
  const userId = await resolveAuditUserId(db, process.env.MOVIE_HUB_AUDIT_UID)
  const report = await auditPersonalDataEncryption({ db, userId })
  await writeFile('personal-data-encryption-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify(report, null, 2))
  if (report.status === 'blocked') process.exitCode = 1
  if (process.env.MOVIE_HUB_EXPECT_NO_PLAINTEXT === 'true'
      && report.status !== 'plaintext_free') process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
