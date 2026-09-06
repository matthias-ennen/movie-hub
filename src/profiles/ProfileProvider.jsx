import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseReady } from '../lib/firebase.js'
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings } from '../theme/themeConfig.js'

const ProfileContext = createContext(null)
const LEGACY_THEME_STORAGE_KEY = 'movie-hub-theme-settings-v1'

function activeProfileStorageKey(uid) {
  return `movie-hub-active-profile-v1:${uid}`
}

function readLegacyThemeSettings() {
  if (typeof window === 'undefined') return normalizeThemeSettings(DEFAULT_THEME_SETTINGS)

  try {
    const stored = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
    return normalizeThemeSettings(stored ? JSON.parse(stored) : DEFAULT_THEME_SETTINGS)
  } catch {
    return normalizeThemeSettings(DEFAULT_THEME_SETTINGS)
  }
}

function normalizeProfile(snapshot) {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : 'Profil',
    role: data.role === 'primary' ? 'primary' : 'member',
    themeSettings: normalizeThemeSettings(data.themeSettings),
  }
}

function sortProfiles(items) {
  return [...items].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1
    return a.displayName.localeCompare(b.displayName, 'de')
  })
}

function persistActiveProfile(uid, profileId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(activeProfileStorageKey(uid), profileId)
  } catch {
    // Lokaler Speicher ist nur Komfortzustand; Firestore-Profildaten bleiben davon unberührt.
  }
}

export function ProfileProvider({ user, children }) {
  const [profiles, setProfiles] = useState([])
  const [activeProfileId, setActiveProfileId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfiles() {
      setLoading(true)
      setError(null)

      try {
        const { db } = await firebaseReady
        const profilesRef = collection(db, 'users', user.uid, 'profiles')
        let snapshot = await getDocs(profilesRef)

        if (snapshot.empty) {
          await setDoc(doc(db, 'users', user.uid, 'profiles', 'main'), {
            displayName: 'Hauptprofil',
            role: 'primary',
            themeSettings: readLegacyThemeSettings(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          snapshot = await getDocs(profilesRef)
        }

        if (cancelled) return

        const loadedProfiles = sortProfiles(snapshot.docs.map(normalizeProfile))
        const storedProfileId = (() => {
          try {
            return window.localStorage.getItem(activeProfileStorageKey(user.uid))
          } catch {
            return null
          }
        })()
        const preferredProfile = loadedProfiles.find((profile) => profile.id === storedProfileId)
          ?? loadedProfiles.find((profile) => profile.role === 'primary')
          ?? loadedProfiles[0]

        setProfiles(loadedProfiles)
        setActiveProfileId(preferredProfile?.id ?? null)
        if (preferredProfile) persistActiveProfile(user.uid, preferredProfile.id)
      } catch (profileError) {
        if (!cancelled) setError(profileError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfiles()
    return () => { cancelled = true }
  }, [user.uid])

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  )

  const selectProfile = useCallback((profileId) => {
    if (!profiles.some((profile) => profile.id === profileId)) return
    setActiveProfileId(profileId)
    persistActiveProfile(user.uid, profileId)
  }, [profiles, user.uid])

  const createProfile = useCallback(async () => {
    const { db } = await firebaseReady
    const profileRef = doc(collection(db, 'users', user.uid, 'profiles'))
    const displayName = `Profil ${profiles.length + 1}`
    const themeSettings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS)

    await setDoc(profileRef, {
      displayName,
      role: 'member',
      themeSettings,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const newProfile = { id: profileRef.id, displayName, role: 'member', themeSettings }
    setProfiles((current) => sortProfiles([...current, newProfile]))
    setActiveProfileId(profileRef.id)
    persistActiveProfile(user.uid, profileRef.id)
    return profileRef.id
  }, [profiles.length, user.uid])

  const renameProfile = useCallback(async (profileId, displayName) => {
    const normalizedName = String(displayName ?? '').trim().slice(0, 32)
    if (!normalizedName || !profiles.some((profile) => profile.id === profileId)) return false

    const { db } = await firebaseReady
    await setDoc(doc(db, 'users', user.uid, 'profiles', profileId), {
      displayName: normalizedName,
      updatedAt: serverTimestamp(),
    }, { merge: true })

    setProfiles((current) => sortProfiles(current.map((profile) => (
      profile.id === profileId ? { ...profile, displayName: normalizedName } : profile
    ))))
    return true
  }, [profiles, user.uid])

  const updateActiveProfileThemeSettings = useCallback(async (themeSettings) => {
    if (!activeProfileId) return
    const normalized = normalizeThemeSettings(themeSettings)
    const { db } = await firebaseReady

    await setDoc(doc(db, 'users', user.uid, 'profiles', activeProfileId), {
      themeSettings: normalized,
      updatedAt: serverTimestamp(),
    }, { merge: true })

    setProfiles((current) => current.map((profile) => (
      profile.id === activeProfileId ? { ...profile, themeSettings: normalized } : profile
    )))
  }, [activeProfileId, user.uid])

  const value = useMemo(() => ({
    profiles,
    activeProfile,
    loading,
    error,
    selectProfile,
    createProfile,
    renameProfile,
    updateActiveProfileThemeSettings,
  }), [profiles, activeProfile, loading, error, selectProfile, createProfile, renameProfile, updateActiveProfileThemeSettings])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfiles() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfiles muss innerhalb des ProfileProvider verwendet werden.')
  return context
}
