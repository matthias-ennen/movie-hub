export const PERSONAL_CRYPTO_VERSION = 1

function nativeCryptoBridge() {
  if (typeof window === 'undefined') return null
  const bridge = window.MovieHubCrypto
  if (!bridge || typeof bridge.isAvailable !== 'function') return null
  try {
    return bridge.isAvailable() ? bridge : null
  } catch {
    return null
  }
}

export function isEncryptedPersonalValue(value) {
  return Boolean(value
    && typeof value === 'object'
    && Number(value.cryptoVersion) === PERSONAL_CRYPTO_VERSION
    && value.algorithm === 'A256GCM'
    && typeof value.iv === 'string'
    && typeof value.ciphertext === 'string')
}

export function canEncryptPersonalData() {
  return nativeCryptoBridge() !== null
}

export function protectPersonalValue(purpose, value) {
  const clearText = String(value ?? '')
  const bridge = nativeCryptoBridge()
  if (!bridge) return clearText

  const encoded = bridge.encrypt(String(purpose || ''), clearText)
  const envelope = JSON.parse(encoded)
  if (!isEncryptedPersonalValue(envelope)) {
    throw new Error('Ungültiges Verschlüsselungsformat der nativen Movie-Hub-Brücke.')
  }
  return envelope
}

export function readPersonalValue(purpose, value) {
  if (typeof value === 'string') {
    return { value, legacyPlaintext: true }
  }
  if (!isEncryptedPersonalValue(value)) {
    throw new Error('Unbekanntes oder beschädigtes Movie-Hub-Verschlüsselungsformat.')
  }

  const bridge = nativeCryptoBridge()
  if (!bridge) {
    throw new Error('Diese persönlichen Daten benötigen die native Movie-Hub-Kryptobrücke.')
  }
  const clearText = bridge.decrypt(String(purpose || ''), JSON.stringify(value))
  return { value: String(clearText ?? ''), legacyPlaintext: false }
}
