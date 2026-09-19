import { afterEach, describe, expect, it } from 'vitest'
import { planPersonalValueMigration } from '../src/lib/personalDataMigrationPlan.js'

const originalWindow = globalThis.window

function installCryptoBridge() {
  globalThis.window = {
    MovieHubCrypto: {
      isAvailable: () => true,
      encrypt: (_purpose, value) => JSON.stringify({
        cryptoVersion: 1,
        algorithm: 'A256GCM',
        iv: 'test-iv',
        ciphertext: value,
      }),
      decrypt: (_purpose, rawEnvelope) => JSON.parse(rawEnvelope).ciphertext,
    },
  }
}

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

describe('personal Firestore data migration', () => {
  it('encrypts and round-trip verifies a legacy plaintext value', () => {
    installCryptoBridge()
    const result = planPersonalValueMigration({
      purpose: 'sharedMedia.url',
      plaintextPresent: true,
      plaintextValue: 'smb://fritz.nas/Share/Movie.mkv',
      encryptedValue: undefined,
      required: true,
    })

    expect(result.status).toBe('migrate')
    expect(result.envelope).toMatchObject({
      cryptoVersion: 1,
      algorithm: 'A256GCM',
      ciphertext: 'smb://fritz.nas/Share/Movie.mkv',
    })
  })

  it('accepts an existing matching encrypted value without rewriting it', () => {
    installCryptoBridge()
    const envelope = {
      cryptoVersion: 1,
      algorithm: 'A256GCM',
      iv: 'test-iv',
      ciphertext: 'Meine Notiz',
    }
    const result = planPersonalValueMigration({
      purpose: 'profile.note',
      plaintextPresent: true,
      plaintextValue: 'Meine Notiz',
      encryptedValue: envelope,
    })

    expect(result).toMatchObject({ status: 'verified', envelope })
  })

  it('fails closed when ciphertext and plaintext differ', () => {
    installCryptoBridge()
    expect(() => planPersonalValueMigration({
      purpose: 'profile.note',
      plaintextPresent: true,
      plaintextValue: 'Richtige Notiz',
      encryptedValue: {
        cryptoVersion: 1,
        algorithm: 'A256GCM',
        iv: 'test-iv',
        ciphertext: 'Andere Notiz',
      },
    })).toThrow(/stimmt nicht/)
  })

  it('rejects a required shared-media field when neither format exists', () => {
    installCryptoBridge()
    expect(() => planPersonalValueMigration({
      purpose: 'sharedMedia.label',
      plaintextPresent: false,
      encryptedValue: undefined,
      required: true,
    })).toThrow(/fehlt/)
  })
})
