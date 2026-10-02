export const loadDetailModalModule = () => import('../components/DetailModal.jsx')
export const loadProfileViewModule = () => import('../components/ProfileView.jsx')
export const loadSearchViewModule = () => import('../components/SearchView.jsx')
export const loadSettingsViewModule = () => import('../components/SettingsView.jsx')

export const SECONDARY_VIEW_MODULE_LOADERS = Object.freeze({
  detail: loadDetailModalModule,
  profile: loadProfileViewModule,
  search: loadSearchViewModule,
  settings: loadSettingsViewModule,
})

export function preloadSecondaryView(viewId, {
  loaders = SECONDARY_VIEW_MODULE_LOADERS,
} = {}) {
  const load = loaders?.[viewId]
  if (typeof load !== 'function') return null

  try {
    return Promise.resolve(load()).catch(() => null)
  } catch {
    return Promise.resolve(null)
  }
}
