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
    await assertFails(getDoc(doc(db, 'users', 'alice', 'profiles', 'main', 'titles', 'movie-11')))
  })

  it('erlaubt einem Benutzer Lesen und Schreiben im eigenen Diagnosebereich', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const ref = doc(db, 'users', 'alice', 'diagnostics', 'phase0')

    await assertSucceeds(setDoc(ref, { ok: true }))
    const snapshot = await assertSucceeds(getDoc(ref))

    expect(snapshot.data()).toEqual({ ok: true })
  })

  it('erlaubt eigene interne Profile und persönliche Titelzustände', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const profileRef = doc(db, 'users', 'alice', 'profiles', 'main')
    const stateRef = doc(db, 'users', 'alice', 'profiles', 'main', 'titles', 'movie-11')

    await assertSucceeds(setDoc(profileRef, {
      displayName: 'Hauptprofil',
      themeSettings: { themeId: 'midnight' },
    }))
    await assertSucceeds(setDoc(stateRef, {
      favorite: true,
      watchlist: true,
      watched: true,
      rating: 9,
      watchedAt: '2026-09-06',
      note: 'Großartig',
      titleRef: { tmdbId: 11, type: 'movie' },
    }))

    const profileSnapshot = await assertSucceeds(getDoc(profileRef))
    const stateSnapshot = await assertSucceeds(getDoc(stateRef))
    expect(profileSnapshot.data().displayName).toBe('Hauptprofil')
    expect(stateSnapshot.data().rating).toBe(9)
    expect(stateSnapshot.data().favorite).toBe(true)
  })

  it('trennt persönliche Titelzustände zwischen internen Profilen desselben Kontos', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const mainRef = doc(db, 'users', 'alice', 'profiles', 'main', 'titles', 'movie-11')
    const childRef = doc(db, 'users', 'alice', 'profiles', 'child', 'titles', 'movie-11')

    await assertSucceeds(setDoc(mainRef, { favorite: true, rating: 10 }))
    await assertSucceeds(setDoc(childRef, { favorite: false, rating: 6 }))

    expect((await assertSucceeds(getDoc(mainRef))).data().rating).toBe(10)
    expect((await assertSucceeds(getDoc(childRef))).data().rating).toBe(6)
  })

  it('verweigert Zugriff auf Profile und Titelzustände einer fremden UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const foreignProfileRef = doc(db, 'users', 'bob', 'profiles', 'main')
    const foreignStateRef = doc(db, 'users', 'bob', 'profiles', 'main', 'titles', 'movie-11')

    await assertFails(setDoc(foreignProfileRef, { displayName: 'Fremd' }))
    await assertFails(getDoc(foreignProfileRef))
    await assertFails(setDoc(foreignStateRef, { favorite: true }))
    await assertFails(getDoc(foreignStateRef))
  })

  it('verweigert unbekannte persönliche Pfade trotz eigener UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'users', 'alice', 'unbekannt', 'x'), { ok: false }))
  })
})
