import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from './firebase.js'
import {
  PERSONAL_CRYPTO_VERSION,
  canEncryptPersonalData,
} from './personalDataCrypto.js'
import { planPersonalValueMigration } from './personalDataMigrationPlan.js'

const NOTE_PURPOSE = 'profile.note'
const LABEL_PURPOSE = 'sharedMedia.label'
const URL_PURPOSE = 'sharedMedia.url'
const migrationRuns = new Map()

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key)
}

function safeError(error) {
  if (error instanceof Error && error.message) return error.message.slice(0, 240)
  return 'Unbekannter Migrationsfehler.'
}

function emptyFieldSummary() {
  return {
    scanned: 0,
    plaintextPresent: 0,
    encryptedPresent: 0,
    migrated: 0,
    verified: 0,
    empty: 0,
  }
}

function addFieldResult(summary, result) {
  summary.scanned++
  if (result.plaintextPresent) summary.plaintextPresent++
  if (result.encryptedPresent) summary.encryptedPresent++
  if (result.status === 'migrate') summary.migrated++
  if (result.status === 'verified' || result.status === 'migrate') summary.verified++
  if (result.status === 'empty') summary.empty++
}

async function migrateProfileNotes(db, userId, report) {
  const profiles = await getDocs(collection(db, 'users', userId, 'profiles'))
  report.profileDocuments = profiles.size

  for (const profile of profiles.docs) {
    const titles = await getDocs(collection(profile.ref, 'titles'))
    report.titleDocuments += titles.size

    for (const title of titles.docs) {
      const raw = title.data()
      try {
        const result = planPersonalValueMigration({
          purpose: NOTE_PURPOSE,
          plaintextPresent: own(raw, 'note'),
          plaintextValue: raw.note,
          encryptedValue: raw.noteEncrypted,
        })
        if (result.status === 'migrate') {
          await setDoc(title.ref, {
            noteEncrypted: result.envelope,
            cryptoVersion: PERSONAL_CRYPTO_VERSION,
            updatedAt: serverTimestamp(),
          }, { merge: true })
        }
        addFieldResult(report.fields.note, result)
      } catch (error) {
        report.errors.push({
          path: title.ref.path,
          field: 'note',
          message: safeError(error),
        })
      }
    }
  }
}

async function migrateSharedMedia(db, userId, report) {
  const parents = await getDocs(collection(db, 'users', userId, 'sharedMedia'))
  report.sharedMediaDocuments = parents.size

  for (const parent of parents.docs) {
    const entries = await getDocs(collection(parent.ref, 'entries'))
    report.sharedMediaEntries += entries.size

    for (const entry of entries.docs) {
      const raw = entry.data()
      const patch = {}
      const fieldResults = []
      let failed = false

      for (const field of [
        { name: 'label', encryptedName: 'labelEncrypted', purpose: LABEL_PURPOSE },
        { name: 'url', encryptedName: 'urlEncrypted', purpose: URL_PURPOSE },
      ]) {
        try {
          const result = planPersonalValueMigration({
            purpose: field.purpose,
            plaintextPresent: own(raw, field.name),
            plaintextValue: raw[field.name],
            encryptedValue: raw[field.encryptedName],
            required: true,
          })
          fieldResults.push([field.name, result])
          if (result.status === 'migrate') patch[field.encryptedName] = result.envelope
        } catch (error) {
          failed = true
          report.errors.push({
            path: entry.ref.path,
            field: field.name,
            message: safeError(error),
          })
        }
      }

      if (failed) continue

      if (Object.keys(patch).length) {
        try {
          await setDoc(entry.ref, {
            ...patch,
            cryptoVersion: PERSONAL_CRYPTO_VERSION,
            updatedAt: serverTimestamp(),
          }, { merge: true })
        } catch (error) {
          report.errors.push({
            path: entry.ref.path,
            field: 'label/url',
            message: safeError(error),
          })
          continue
        }
      }
      fieldResults.forEach(([fieldName, result]) => addFieldResult(report.fields[fieldName], result))
    }
  }
}

async function executeMigration(userId) {
  if (!userId) throw new Error('Firebase-Benutzer für die Verschlüsselungsmigration fehlt.')
  if (!canEncryptPersonalData()) {
    return { status: 'unavailable', cryptoVersion: PERSONAL_CRYPTO_VERSION }
  }

  const { db } = await firebaseReady
  const report = {
    status: 'running',
    cryptoVersion: PERSONAL_CRYPTO_VERSION,
    profileDocuments: 0,
    titleDocuments: 0,
    sharedMediaDocuments: 0,
    sharedMediaEntries: 0,
    fields: {
      note: emptyFieldSummary(),
      label: emptyFieldSummary(),
      url: emptyFieldSummary(),
    },
    errors: [],
  }

  await migrateProfileNotes(db, userId, report)
  await migrateSharedMedia(db, userId, report)
  report.status = report.errors.length ? 'failed' : 'complete'

  await setDoc(doc(db, 'users', userId, 'diagnostics', 'personal-data-encryption-v1'), {
    ...report,
    completedAt: serverTimestamp(),
  })

  if (report.status !== 'complete') {
    throw new Error(`Verschlüsselungsmigration mit ${report.errors.length} Fehlern beendet.`)
  }
  return report
}

export function runPersonalDataEncryptionMigration(userId) {
  if (!migrationRuns.has(userId)) migrationRuns.set(userId, executeMigration(userId))
  return migrationRuns.get(userId)
}
