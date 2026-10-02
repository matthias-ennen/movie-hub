import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { resolveSecondaryViewLoader } from '../src/performance/lazyViews.jsx'

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const lazySource = readFileSync(new URL('../src/performance/lazyViews.jsx', import.meta.url), 'utf8')

describe('sekundäre Ansichten werden aus dem Kaltstart ausgelagert', () => {
  it('enthält in App.jsx keine statischen Imports der ausgelagerten Ansichten', () => {
    expect(appSource).not.toContain("import DetailModal from './components/DetailModal.jsx'")
    expect(appSource).not.toContain("import SearchView from './components/SearchView.jsx'")
    expect(appSource).not.toContain("import ProfileView from './components/ProfileView.jsx'")
    expect(appSource).not.toContain("import SettingsView from './components/SettingsView.jsx'")
    expect(appSource).not.toContain("import AboutView from './components/AboutView.jsx'")
  })

  it('lädt die ausgelagerten Module ausschließlich dynamisch', () => {
    expect(lazySource).toContain("import('../components/DetailModal.jsx')")
    expect(lazySource).toContain("import('../components/SearchView.jsx')")
    expect(lazySource).toContain("import('../components/ProfileView.jsx')")
    expect(lazySource).toContain("import('../components/SettingsView.jsx')")
    expect(lazySource).toContain("import('../components/AboutView.jsx')")
    expect(lazySource).toContain("import('../tv/TvFeature.jsx')")
  })

  it('ordnet nur sekundäre Views einem Preload-Loader zu', () => {
    const search = vi.fn()
    const profile = vi.fn()
    const settings = vi.fn()
    const about = vi.fn()
    const tv = vi.fn()
    const loaders = { search, profile, settings, about, tv }

    expect(resolveSecondaryViewLoader('search', loaders)).toBe(search)
    expect(resolveSecondaryViewLoader('profile', loaders)).toBe(profile)
    expect(resolveSecondaryViewLoader('settings', loaders)).toBe(settings)
    expect(resolveSecondaryViewLoader('about', loaders)).toBe(about)
    expect(resolveSecondaryViewLoader('tv', loaders)).toBe(tv)
    expect(resolveSecondaryViewLoader('home', loaders)).toBeNull()
  })

  it('wartet beim atomaren Detailaufbau zusätzlich auf das Detailmodul', () => {
    expect(appSource).toContain('const detailModuleLoad = loadDetailModalModule()')
    expect(appSource).toMatch(/Promise\.all\(\[[\s\S]*mediaLoad,[\s\S]*detailModuleLoad,[\s\S]*\]\)/)
  })
})
