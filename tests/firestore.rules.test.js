import fs from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'

let testEnv

function encryptedValue(ciphertext = 'ciphertext') {
  return {
    cryptoVersion: 1,
    algorithm: 'A256GCM',
    iv: 'base64-iv',
    ciphertext,
  }
}

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
  it('liefert veröffentlichte Ankündigungen nur an angemeldete Nutzer und schützt Schreibzugriffe', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'announcements', 'public'), { status: 'published', title: 'Hallo' })
      await setDoc(doc(context.firestore(), 'announcements', 'draft'), { status: 'draft', title: 'Entwurf' })
    })
    const alice = testEnv.authenticatedContext('alice').firestore()
    const anonymous = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(alice, 'announcements', 'public')))
    await assertFails(getDoc(doc(alice, 'announcements', 'draft')))
    await assertFails(getDoc(doc(anonymous, 'announcements', 'public')))
    await assertFails(setDoc(doc(alice, 'announcements', 'public'), { status: 'published' }))
    const visible = await assertSucceeds(getDocs(query(collection(alice, 'announcements'), where('status', '==', 'published'))))
    expect(visible.docs.map((entry) => entry.id)).toContain('public')
  })

  it('erlaubt den Lesestatus nur im eigenen Konto und ausschließlich mit Serverzeit', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    const own = doc(alice, 'users', 'alice', 'announcementReads', 'public')
    await assertSucceeds(setDoc(own, { readAt: serverTimestamp() }))
    await assertSucceeds(getDoc(own))
    await assertFails(setDoc(own, { readAt: 'manuell' }))
    await assertFails(setDoc(doc(alice, 'users', 'bob', 'announcementReads', 'public'), { readAt: serverTimestamp() }))
  })
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
      categorySettings: {
        enabledMovieCategoryIds: ['action', 'horror'],
        enabledSeriesCategoryIds: ['crime', 'mystery'],
      },
      contentRowSettings: {
        rows: [{ id: 'brad-pitt', type: 'cast', valueId: 287, valueLabel: 'Brad Pitt', title: 'Mit Brad Pitt', enabled: true, order: 0 }],
      },
    }))
    await assertSucceeds(setDoc(stateRef, {
      favorite: true,
      watchlist: true,
      watched: true,
      rating: 9,
      watchedAt: '2026-09-06',
      noteEncrypted: encryptedValue('encrypted-note'),
      cryptoVersion: 1,
      titleRef: { tmdbId: 11, type: 'movie' },
    }))

    const profileSnapshot = await assertSucceeds(getDoc(profileRef))
    const stateSnapshot = await assertSucceeds(getDoc(stateRef))
    expect(profileSnapshot.data().displayName).toBe('Hauptprofil')
    expect(profileSnapshot.data().categorySettings.enabledMovieCategoryIds).toEqual(['action', 'horror'])
    expect(profileSnapshot.data().contentRowSettings.rows[0].title).toBe('Mit Brad Pitt')
    expect(stateSnapshot.data().rating).toBe(9)
    expect(stateSnapshot.data().favorite).toBe(true)
  })

  it('trennt persönliche Titelzustände zwischen internen Profilen desselben Kontos', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const mainRef = doc(db, 'users', 'alice', 'profiles', 'main', 'titles', 'movie-11')
    const childRef = doc(db, 'users', 'alice', 'profiles', 'child', 'titles', 'movie-11')

    await assertSucceeds(setDoc(mainRef, {
      favorite: true,
      rating: 10,
      noteEncrypted: encryptedValue('main-note'),
    }))
    await assertSucceeds(setDoc(childRef, {
      favorite: false,
      rating: 6,
      noteEncrypted: encryptedValue('child-note'),
    }))

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
    const catalogRef = doc(db, 'users', 'alice', 'sharedMedia', 'movie-11')
    const mediaRef = doc(db, 'users', 'alice', 'sharedMedia', 'movie-11', 'entries', 'trailer')

    await assertSucceeds(setDoc(catalogRef, {
      hasMedia: true,
      titleRef: { id: 'tmdb-movie-11', tmdbId: 11, type: 'movie', title: 'Star Wars' },
    }))
    await assertSucceeds(setDoc(mediaRef, {
      labelEncrypted: encryptedValue('encrypted-label'),
      type: 'web',
      urlEncrypted: encryptedValue('encrypted-url'),
      cryptoVersion: 1,
    }))
    expect((await assertSucceeds(getDoc(catalogRef))).data().hasMedia).toBe(true)
    expect((await assertSucceeds(getDoc(mediaRef))).data().labelEncrypted.algorithm).toBe('A256GCM')
  })

  it('verweigert persönliche Titelnotizen im Klartext auch dem Eigentümer', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const stateRef = doc(db, 'users', 'alice', 'profiles', 'main', 'titles', 'movie-12')

    await assertFails(setDoc(stateRef, {
      favorite: true,
      note: 'Darf nicht gespeichert werden',
      noteEncrypted: encryptedValue('encrypted-note'),
    }))
  })

  it('verweigert Labels und Links im Klartext auch dem Eigentümer', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const mediaRef = doc(db, 'users', 'alice', 'sharedMedia', 'movie-12', 'entries', 'local')

    await assertFails(setDoc(mediaRef, {
      label: 'NAS',
      url: 'smb://fritz.nas/Share/Movie.mkv',
      labelEncrypted: encryptedValue('encrypted-label'),
      urlEncrypted: encryptedValue('encrypted-url'),
      type: 'video',
    }))
  })

  it('verweigert beschädigte Verschlüsselungsumschläge', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const stateRef = doc(db, 'users', 'alice', 'profiles', 'main', 'titles', 'movie-13')

    await assertFails(setDoc(stateRef, {
      favorite: true,
      noteEncrypted: {
        cryptoVersion: 1,
        algorithm: 'A256GCM',
        iv: '',
        ciphertext: 'ciphertext',
      },
    }))
  })

  it('erlaubt Bewertungen, Altersfreigabe und den neuen Teil-Sync-Status im persönlichen TMDB-Katalog', async () => {
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
      artwork: { posterPaths: ['/neutral.jpg'], heroBackdropPaths: ['/wide.jpg'] },
      collectionId: 40,
      collectionName: 'Sternensaga',
      collectionChecked: true,
      metadataVersion: 3,
      metadataComplete: true,
      metadataChecks: {
        details: 'present', artwork: 'present', ageRating: 'present', credits: 'present',
        keywords: 'absent', videos: 'absent', providers: 'present', collection: 'present',
      },
      metadataUpdatedAt: '2026-09-13T07:00:00Z',
      runtimeMinutes: 121,
      numberOfSeasons: null,
      numberOfEpisodes: null,
      seasons: [],
      cast: [{ id: 1, name: 'Mark Hamill' }],
      videos: [],
      smartFacets: { creators: [{ id: 2, name: 'George Lucas' }] },
      originalLanguage: 'en',
      voteAverage: 8.2,
      voteCount: 1000,
      genreNames: ['Abenteuer'],
      providerIds: ['disney'],
      ageRating: 12,
      favorite: true,
      watchlist: false,
      rated: true,
      ratingValue: 9,
      favoriteOrder: 1,
      watchlistOrder: null,
      ratingOrder: 1,
      syncedAt: '2026-09-09T12:00:00Z',
    }))
    await assertSucceeds(setDoc(syncRef, {
      syncedAt: '2026-09-16T11:35:00Z',
      accountId: 123,
      accountUsername: 'alice-tmdb',
      accountName: null,
      favoriteCount: 60,
      watchlistCount: 65,
      ratingCount: 31,
      totalCount: 93,
      partial: true,
      successfulSections: 5,
      totalSections: 6,
      sections: [
        { id: 'favorite_movies', label: 'Favoriten Filme', ok: true, count: 40, retried: false, preserved: false, error: null },
        { id: 'rated_tv', label: 'Bewertungen Serien', ok: false, count: null, retried: true, preserved: true, error: 'HTTP 500 · TMDB-Status 11' },
      ],
    }))
    const stored = (await assertSucceeds(getDoc(catalogRef))).data()
    const syncState = (await assertSucceeds(getDoc(syncRef))).data()
    expect(stored.favorite).toBe(true)
    expect(stored.rated).toBe(true)
    expect(stored.ratingValue).toBe(9)
    expect(stored.ageRating).toBe(12)
    expect(syncState.partial).toBe(true)
    expect(syncState.successfulSections).toBe(5)
    expect(syncState.sections[1].preserved).toBe(true)
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

  it('verhindert unbekannte Top-Level-Felder im TMDB-Sync-Status', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const ref = doc(db, 'users', 'alice', 'tmdbSync', 'state')
    await assertFails(setDoc(ref, {
      syncedAt: '2026-09-16T11:35:00Z',
      favoriteCount: 60,
      watchlistCount: 65,
      ratingCount: 31,
      totalCount: 93,
      partial: false,
      successfulSections: 6,
      totalSections: 6,
      sections: [],
      apiReadAccessToken: 'darf-nicht-gespeichert-werden',
    }))
  })

  it('verweigert Zugriff auf gemeinsamen TMDB-Katalog und Medien eines fremden Kontos', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const foreignCatalogRef = doc(db, 'users', 'bob', 'sharedMedia', 'movie-11')
    const foreignMediaRef = doc(db, 'users', 'bob', 'sharedMedia', 'movie-11', 'entries', 'trailer')
    const foreignTmdbRef = doc(db, 'users', 'bob', 'tmdbCatalog', 'movie:11')

    await assertFails(setDoc(foreignCatalogRef, { hasMedia: true }))
    await assertFails(getDoc(foreignCatalogRef))
    await assertFails(setDoc(foreignMediaRef, { label: 'Fremd', type: 'web', url: 'https://example.com' }))
    await assertFails(getDoc(foreignMediaRef))
    await assertFails(getDoc(foreignTmdbRef))
  })

  it('verweigert unbekannte persönliche Pfade trotz eigener UID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'users', 'alice', 'unbekannt', 'x'), { ok: false }))
  })
})
