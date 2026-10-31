import { throwIfAborted, yieldToMain, withDeadline } from '../performance/cooperativeWork.js'
import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc, query, orderBy, documentId, limit, startAfter } from 'firebase/firestore'
import { firebaseReady } from './firebase.js'
import {
  PERSONAL_CRYPTO_VERSION,
  canEncryptPersonalData,
} from './personalDataCrypto.js'
import { planPersonalValueCleanup } from './personalDataMigrationPlan.js'

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
    plaintextRemoved: 0,
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

// Never skip verification merely because a past run succeeded: an older client
// may have written plaintext since. Page the audit after interactive startup,
// yield between documents, and allow account teardown to cancel future work.
async function* migrationDocuments(reference, signal) {
  let cursor = null
  while (true) {
    throwIfAborted(signal)
    const constraints = [orderBy(documentId()), limit(50)]
    if (cursor) constraints.push(startAfter(cursor))
    const page = await withDeadline(getDocs(query(reference, ...constraints)), 8000)
    throwIfAborted(signal)
    for (const document of page.docs) {
      await yieldToMain(signal)
      yield document
    }
    if (page.size < 50) return
    cursor = page.docs[page.docs.length - 1]
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

async function migrateProfileNotes(db, userId, report, signal) {
  for await (const profile of migrationDocuments(collection(db, 'users', userId, 'profiles'), signal)) {
    report.profileDocuments++
    for await (const title of migrationDocuments(collection(profile.ref, 'titles'), signal)) {
      report.titleDocuments++
      const raw = title.data()
      try {
        const result = planPersonalValueCleanup({
          purpose: NOTE_PURPOSE,
          plaintextPresent: own(raw, 'note'),
          plaintextValue: raw.note,
          encryptedValue: raw.noteEncrypted,
        })
        const patch = {}
        if (result.status === 'migrate') patch.noteEncrypted = result.envelope
        if (result.deletePlaintext) patch.note = deleteField()
        if (Object.keys(patch).length) {
          await setDoc(title.ref, {
            ...patch,
            cryptoVersion: PERSONAL_CRYPTO_VERSION,
            updatedAt: serverTimestamp(),
          }, { merge: true })
        }
        addFieldResult(report.fields.note, result)
        if (result.deletePlaintext) report.fields.note.plaintextRemoved++
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

async function migrateSharedMedia(db, userId, report, signal) {
  for await (const parent of migrationDocuments(collection(db, 'users', userId, 'sharedMedia'), signal)) {
    report.sharedMediaDocuments++
    for await (const entry of migrationDocuments(collection(parent.ref, 'entries'), signal)) {
      report.sharedMediaEntries++
      const raw = entry.data()
      const patch = {}
      const fieldResults = []
      let failed = false

      for (const field of [
        { name: 'label', encryptedName: 'labelEncrypted', purpose: LABEL_PURPOSE },
        { name: 'url', encryptedName: 'urlEncrypted', purpose: URL_PURPOSE },
      ]) {
        try {
          const result = planPersonalValueCleanup({
            purpose: field.purpose,
            plaintextPresent: own(raw, field.name),
            plaintextValue: raw[field.name],
            encryptedValue: raw[field.encryptedName],
            required: true,
          })
          fieldResults.push([field.name, result])
          if (result.status === 'migrate') patch[field.encryptedName] = result.envelope
          if (result.deletePlaintext) patch[field.name] = deleteField()
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
      fieldResults.forEach(([fieldName, result]) => {
        addFieldResult(report.fields[fieldName], result)
        if (result.deletePlaintext) report.fields[fieldName].plaintextRemoved++
      })
    }
  }
}

async function executeMigration(userId, signal) {
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

  await migrateProfileNotes(db, userId, report, signal)
  await migrateSharedMedia(db, userId, report, signal)
  throwIfAborted(signal)
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

export function runPersonalDataEncryptionMigration(userId, { signal } = {}) {
  if (!migrationRuns.has(userId)) migrationRuns.set(userId, executeMigration(userId, signal).catch(error => {
    migrationRuns.delete(userId)
    throw error
  }))
  return migrationRuns.get(userId)
}
