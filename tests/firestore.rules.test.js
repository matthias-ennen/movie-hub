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
    await assertFails(getDoc(doc(db, 'users', 'alice', 'tmdbCatalog', 'movie:11')))
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

  it('teilt gemeinsame Movie-Hub-Medien kontoweit statt profilbezogen', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const mediaRef = doc(db, 'users', 'alice', 'sharedMedia', 'movie-11', 'entries', 'trailer')

    await assertSucceeds(setDoc(mediaRef, {
      label: 'Deutscher Trailer',
      type: 'web',
      url: 'https://www.youtube.com/watch?v=test123',
    }))
    expect((await assertSucceeds(getDoc(mediaRef))).data().label).toBe('Deutscher Trailer')
  })

  it('erlaubt den nicht geheimen persönlichen TMDB-Katalog kontoweit', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const catalogRef = doc(db, 'users', 'alice', 'tmdbCatalog', 'movie:11')
    const syncRef = doc(db, 'users', 'alice', 'tmdbSync', 'state')

    await assertSucceeds(setDoc(catalogRef, {
      tmdbId: 11,
      mediaType: 'movie',
      title: 'Star Wars',
      originalTitle: 'Star Wars',
      description: '',
      releaseDate: '1977-05-25',
      posterPath: null,
      backdropPath: null,
      originalLanguage: 'en',
      voteAverage: 8.2,
      voteCount: 1000,
      genreNames: ['Abenteuer'],
      providerIds: ['disney'],
      favorite: true,
      watchlist: false,
      favoriteOrder: 1,
      watchlistOrder: null,
      syncedAt: '2026-09-09T12:00:00Z',
    }))
    await assertSucceeds(setDoc(syncRef, {
      syncedAt: '2026-09-09T12:00:00Z',
      accountId: 123,
      accountUsername: 'alice-tmdb',
      accountName: null,
      favoriteCount: 1,
      watchlistCount: 0,
      totalCount: 1,
    }))
    expect((await assertSucceeds(getDoc(catalogRef))).data().favorite).toBe(true)
  })

  it('verhindert das Einschleusen unbekannter Felder in den TMDB-Katalog', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const ref = doc(db, 'users', 'alice', 'tmdbCatalog', 'movie:11')
    await assertFails(setDoc(ref, {
      tmdbId: 11,
      mediaType: 'movie',
      title: 'Star Wars',
      apiReadAccessToken: 'darf-nicht-gespeichert-werden',
    }))
  })

  it('verweigert Zugriff auf gemeinsamen TMDB-Katalog und Medien eines fremden Kontos', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const foreignMediaRef = doc(db, 'users', 'bob', 'sharedMedia', 'movie-11', 'entries', 'trailer')
    const foreignTmdbRef = doc(db, 'users', 'bob', 'tmdbCatalog', 'movie:11')

    await assertFails(setDoc(foreignMediaRef, { label: 'Fremd', type: 'web', url: 'https://example.com' }))
    await assertFails(getDoc(foreignMediaRef))
    await assertFails(getDoc(foreignTmdbRef))
  })

  it('verweigert unbekannte persönliche Pfade trotz eigener UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'users', 'alice', 'unbekannt', 'x'), { ok: false }))
  })
})
