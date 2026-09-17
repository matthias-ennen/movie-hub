import { afterEach, describe, expect, it } from 'vitest'
import {
  canEncryptPersonalData,
  isEncryptedPersonalValue,
  protectPersonalValue,
  readPersonalValue,
} from '../src/lib/personalDataCrypto.js'

const originalWindow = globalThis.window

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

describe('personal data crypto bridge', () => {
  it('keeps plaintext readable while no native bridge is available', () => {
    delete globalThis.window
    expect(canEncryptPersonalData()).toBe(false)
    expect(protectPersonalValue('profile.note', 'privat')).toBe('privat')
    expect(readPersonalValue('profile.note', 'privat')).toEqual({
      value: 'privat',
      legacyPlaintext: true,
    })
  })

  it('uses the native bridge for encrypted envelopes', () => {
    const envelope = {
      cryptoVersion: 1,
      algorithm: 'A256GCM',
      iv: 'iv-value',
      ciphertext: 'cipher-value',
    }
    globalThis.window = {
      MovieHubCrypto: {
        isAvailable: () => true,
        encrypt: (purpose, value) => {
          expect(purpose).toBe('sharedMedia.url')
          expect(value).toBe('smb://fritz.nas/Share/Movie.mkv')
          return JSON.stringify(envelope)
        },
        decrypt: (purpose, rawEnvelope) => {
          expect(purpose).toBe('sharedMedia.url')
          expect(JSON.parse(rawEnvelope)).toEqual(envelope)
          return 'smb://fritz.nas/Share/Movie.mkv'
        },
      },
    }

    const protectedValue = protectPersonalValue(
      'sharedMedia.url',
      'smb://fritz.nas/Share/Movie.mkv',
    )
    expect(isEncryptedPersonalValue(protectedValue)).toBe(true)
    expect(readPersonalValue('sharedMedia.url', protectedValue)).toEqual({
      value: 'smb://fritz.nas/Share/Movie.mkv',
      legacyPlaintext: false,
    })
  })

  it('rejects unknown encrypted formats instead of guessing', () => {
    globalThis.window = { MovieHubCrypto: { isAvailable: () => true } }
    expect(() => readPersonalValue('profile.note', {
      cryptoVersion: 99,
      algorithm: 'A256GCM',
      iv: 'x',
      ciphertext: 'y',
    })).toThrow(/Unbekanntes|beschädigtes/)
  })
})
