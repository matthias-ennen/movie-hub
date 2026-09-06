import fs from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'movie-hub-rules-test',
    firestore: {
      rules: await fs.readFile('firestore.rules', 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('Firestore Security Rules', () => {
  it('weist unauthentifizierte Zugriffe auf persönliche Daten ab', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'users', 'alice', 'diagnostics', 'phase0')))
  })

  it('erlaubt einem Benutzer Lesen und Schreiben im eigenen Bereich', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const ref = doc(db, 'users', 'alice', 'diagnostics', 'phase0')

    await assertSucceeds(setDoc(ref, { ok: true }))
    const snapshot = await assertSucceeds(getDoc(ref))

    expect(snapshot.data()).toEqual({ ok: true })
  })

  it('verweigert Zugriff auf den Bereich einer fremden UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const foreignRef = doc(db, 'users', 'bob', 'diagnostics', 'phase0')

    await assertFails(setDoc(foreignRef, { ok: false }))
    await assertFails(getDoc(foreignRef))
  })
})
