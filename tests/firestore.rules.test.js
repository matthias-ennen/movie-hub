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
    await assertFails(getDoc(doc(db, 'users', 'alice', 'profiles', 'main')))
  })

  it('erlaubt einem Benutzer Lesen und Schreiben im eigenen Diagnosebereich', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const ref = doc(db, 'users', 'alice', 'diagnostics', 'phase0')

    await assertSucceeds(setDoc(ref, { ok: true }))
    const snapshot = await assertSucceeds(getDoc(ref))

    expect(snapshot.data()).toEqual({ ok: true })
  })

  it('erlaubt eigene interne Profile und deren Unterdaten', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const profileRef = doc(db, 'users', 'alice', 'profiles', 'main')
    const stateRef = doc(db, 'users', 'alice', 'profiles', 'main', 'library', 'movie-11')

    await assertSucceeds(setDoc(profileRef, {
      displayName: 'Hauptprofil',
      themeSettings: { themeId: 'midnight' },
    }))
    await assertSucceeds(setDoc(stateRef, { favorite: true }))

    const profileSnapshot = await assertSucceeds(getDoc(profileRef))
    const stateSnapshot = await assertSucceeds(getDoc(stateRef))
    expect(profileSnapshot.data().displayName).toBe('Hauptprofil')
    expect(stateSnapshot.data()).toEqual({ favorite: true })
  })

  it('verweigert Zugriff auf Profile einer fremden UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const foreignProfileRef = doc(db, 'users', 'bob', 'profiles', 'main')
    const foreignStateRef = doc(db, 'users', 'bob', 'profiles', 'main', 'library', 'movie-11')

    await assertFails(setDoc(foreignProfileRef, { displayName: 'Fremd' }))
    await assertFails(getDoc(foreignProfileRef))
    await assertFails(setDoc(foreignStateRef, { favorite: true }))
  })

  it('verweigert unbekannte persönliche Pfade trotz eigener UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'users', 'alice', 'unbekannt', 'x'), { ok: false }))
  })
})
