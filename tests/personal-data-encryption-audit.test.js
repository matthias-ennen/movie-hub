import { describe, expect, it } from 'vitest'
import {
  auditPersonalDataEncryption,
  isValidEncryptionEnvelope,
} from '../scripts/audit-personal-data-encryption.mjs'

const envelope = {
  cryptoVersion: 1,
  algorithm: 'A256GCM',
  iv: 'valid-iv',
  ciphertext: 'valid-ciphertext',
}

function snapshot(id, data, collections = {}) {
  const ref = {
    collection: (name) => ({ get: async () => collectionSnapshot(collections[name] || []) }),
  }
  return { id, ref, data: () => data }
}

function collectionSnapshot(docs) {
  return { size: docs.length, docs }
}

function createDb({ diagnostic, profiles = [], sharedMedia = [] }) {
  return {
    doc: () => ({ get: async () => ({ exists: Boolean(diagnostic), data: () => diagnostic }) }),
    collection: (path) => ({
      get: async () => path.endsWith('/profiles')
        ? collectionSnapshot(profiles)
        : collectionSnapshot(sharedMedia),
    }),
  }
}

describe('personal data encryption audit', () => {
  it('validates only the supported AES-GCM envelope', () => {
    expect(isValidEncryptionEnvelope(envelope)).toBe(true)
    expect(isValidEncryptionEnvelope({ ...envelope, cryptoVersion: 2 })).toBe(false)
    expect(isValidEncryptionEnvelope({ ...envelope, ciphertext: '' })).toBe(false)
  })

  it('reports migrated dual fields as ready for plaintext cleanup', async () => {
    const title = snapshot('movie-1', { note: 'privat', noteEncrypted: envelope })
    const profile = snapshot('main', {}, { titles: [title] })
    const entry = snapshot('entry-1', {
      label: 'NAS',
      labelEncrypted: envelope,
      url: 'smb://server/share/movie.mkv',
      urlEncrypted: envelope,
    })
    const parent = snapshot('movie-1', {}, { entries: [entry] })
    const db = createDb({
      diagnostic: { status: 'complete', cryptoVersion: 1, errors: [] },
      profiles: [profile],
      sharedMedia: [parent],
    })

    const report = await auditPersonalDataEncryption({ db, userId: 'u1' })
    expect(report.status).toBe('ready_for_plaintext_cleanup')
    expect(report.blockers).toEqual([])
    expect(report.plaintextFieldCount).toBe(3)
    expect(report.encryptedFieldCount).toBe(3)
  })

  it('reports encrypted-only fields as plaintext-free', async () => {
    const title = snapshot('movie-1', { noteEncrypted: envelope })
    const profile = snapshot('main', {}, { titles: [title] })
    const entry = snapshot('entry-1', { labelEncrypted: envelope, urlEncrypted: envelope })
    const parent = snapshot('movie-1', {}, { entries: [entry] })
    const db = createDb({
      diagnostic: { status: 'complete', cryptoVersion: 1, errors: [] },
      profiles: [profile],
      sharedMedia: [parent],
    })

    const report = await auditPersonalDataEncryption({ db, userId: 'u1' })
    expect(report.status).toBe('plaintext_free')
    expect(report.plaintextFieldCount).toBe(0)
  })

  it('blocks cleanup when an encrypted counterpart is missing', async () => {
    const title = snapshot('movie-1', { note: 'privat' })
    const profile = snapshot('main', {}, { titles: [title] })
    const db = createDb({
      diagnostic: { status: 'complete', cryptoVersion: 1, errors: [] },
      profiles: [profile],
    })

    const report = await auditPersonalDataEncryption({ db, userId: 'u1' })
    expect(report.status).toBe('blocked')
    expect(report.blockers).toContainEqual(expect.objectContaining({
      field: 'noteEncrypted',
      reason: 'missing_encrypted_counterpart',
    }))
  })
})
