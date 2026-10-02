import { lazy } from 'react'

function createResettableModuleLoader(importer) {
  let promise = null
  return () => {
    if (!promise) {
      promise = importer().catch((error) => {
        promise = null
        throw error
      })
    }
    return promise
  }
}

export const loadDetailModalModule = createResettableModuleLoader(() => import('../components/DetailModal.jsx'))
export const loadAboutViewModule = createResettableModuleLoader(() => import('../components/AboutView.jsx'))
export const loadSearchViewModule = createResettableModuleLoader(() => import('../components/SearchView.jsx'))
export const loadProfileViewModule = createResettableModuleLoader(() => import('../components/ProfileView.jsx'))
export const loadSettingsViewModule = createResettableModuleLoader(() => import('../components/SettingsView.jsx'))

const secondaryViewLoaders = Object.freeze({
  search: loadSearchViewModule,
  profile: loadProfileViewModule,
  settings: loadSettingsViewModule,
  about: loadAboutViewModule,
})

export function resolveSecondaryViewLoader(viewId, loaders = secondaryViewLoaders) {
  return loaders?.[viewId] || null
}

export function preloadSecondaryViewModule(viewId) {
  const loader = resolveSecondaryViewLoader(viewId)
  if (!loader) return null
  return loader()
}

export const LazyDetailModal = lazy(loadDetailModalModule)
export const LazyAboutView = lazy(loadAboutViewModule)
export const LazySearchView = lazy(loadSearchViewModule)
export const LazyProfileView = lazy(loadProfileViewModule)
export const LazySettingsView = lazy(loadSettingsViewModule)
