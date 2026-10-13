export const SETTINGS_PAGES = {
  overview: { title: 'Einstellungen', parent: null },
  appearance: { title: 'Oberfläche', parent: 'overview', group: 'profile', description: 'Posteranzahl, Heroes, Trailer und sichtbare Bereiche' },
  design: { title: 'Design', parent: 'overview', group: 'profile', description: 'Design auswählen und automatisch wechseln' },
  categories: { title: 'Meine Kategorien', parent: 'overview', group: 'profile', description: 'Filme und Serien auswählen und sortieren' },
  personal: { title: 'Persönliche Posterreihen', parent: 'overview', group: 'profile', description: 'Eigene Reihen erstellen, bearbeiten und sortieren' },
  sorting: { title: 'Sortierung & Abwechslung', parent: 'overview', group: 'profile', description: 'Titelreihenfolge, gesehene Titel und Posterbilder' },
  notifications: { title: 'Mitteilungen', parent: 'overview', group: 'profile', description: 'Beobachtete Titel und Erinnerungen verwalten' },
  providers: { title: 'Streaminganbieter', parent: 'overview', group: 'account', description: 'Anbieter ein- oder ausschalten' },
  waipu: { title: 'Waipu-Sender', parent: 'overview', group: 'account', description: 'Sender bei waipu.tv auswählen' },
  joyn: { title: 'Joyn-Sender', parent: 'overview', group: 'account', description: 'Sender bei Joyn auswählen' },
  network: { title: 'Netzlaufwerke', parent: 'overview', group: 'device', description: 'Freigaben im Heimnetz verbinden und verwalten' },
  tmdb: { title: 'TMDB-Verbindung', parent: 'overview', group: 'device', description: 'TMDB-Zugang einrichten und Inhalte synchronisieren' },
}

export const SETTINGS_GROUPS = ['profile', 'account', 'device'].map((id) => ({
  id,
  pages: Object.entries(SETTINGS_PAGES).filter(([, page]) => page.group === id),
}))

export function settingsScopeLabel(group, profileName) {
  if (group === 'profile') return `Profil: ${profileName || '–'}`
  if (group === 'account') return 'Für alle Profile'
  if (group === 'device') return 'Dieses Gerät'
  return ''
}

export function settingsParent(page) { return SETTINGS_PAGES[page]?.parent || null }
export function settingsNeedStations(page) { return page === 'waipu' || page === 'joyn' }
