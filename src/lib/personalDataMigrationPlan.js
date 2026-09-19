import {
  isEncryptedPersonalValue,
  protectPersonalValue,
  readPersonalValue,
} from './personalDataCrypto.js'

export function planPersonalValueMigration({
  purpose,
  plaintextPresent,
  plaintextValue,
  encryptedValue,
  required = false,
}) {
  const hasPlaintext = Boolean(plaintextPresent)
  const hasEncrypted = isEncryptedPersonalValue(encryptedValue)

  if (hasPlaintext && typeof plaintextValue !== 'string') {
    throw new Error('Persönlicher Klartextwert hat einen ungültigen Datentyp.')
  }

  if (hasEncrypted) {
    const clearText = readPersonalValue(purpose, encryptedValue).value
    if (hasPlaintext && clearText !== plaintextValue) {
      throw new Error('Verschlüsselter Wert stimmt nicht mit dem Klartextwert überein.')
    }
    return {
      status: 'verified',
      plaintextPresent: hasPlaintext,
      encryptedPresent: true,
      envelope: encryptedValue,
    }
  }

  if (encryptedValue !== undefined && encryptedValue !== null) {
    throw new Error('Vorhandener verschlüsselter Wert hat ein unbekanntes Format.')
  }

  if (hasPlaintext) {
    const envelope = protectPersonalValue(purpose, plaintextValue)
    const clearText = readPersonalValue(purpose, envelope).value
    if (clearText !== plaintextValue) {
      throw new Error('Verschlüsselter Wert hat die Rückleseprüfung nicht bestanden.')
    }
    return {
      status: 'migrate',
      plaintextPresent: true,
      encryptedPresent: false,
      envelope,
    }
  }

  if (required) throw new Error('Erforderlicher persönlicher Wert fehlt.')
  return {
    status: 'empty',
    plaintextPresent: false,
    encryptedPresent: false,
    envelope: null,
  }
}
