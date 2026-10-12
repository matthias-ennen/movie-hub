export const SETTINGS_PAGES = {
  overview: { title: 'Einstellungen', parent: null },
  display: { title: 'Darstellung & Posterreihen', parent: 'overview', description: 'Design, Oberfläche und persönliche Reihen · Profil' },
  appearance: { title: 'Oberfläche', parent: 'display', description: 'Posteranzahl, Heroes, Trailer und sichtbare Bereiche' },
  design: { title: 'Design', parent: 'display', description: 'Design auswählen und automatisch wechseln' },
  categories: { title: 'Meine Kategorien', parent: 'display', description: 'Filme und Serien auswählen und sortieren' },
  personal: { title: 'Persönliche Posterreihen', parent: 'display', description: 'Eigene Reihen erstellen, bearbeiten und sortieren' },
  sorting: { title: 'Sortierung & Abwechslung', parent: 'display', description: 'Titelreihenfolge, gesehene Titel und Posterbilder' },
  sources: { title: 'Anbieter & Sender', parent: 'overview', description: 'Streaminganbieter, Waipu- und Joyn-Sender · Konto' },
  providers: { title: 'Streaminganbieter', parent: 'sources', description: 'Anbieter für alle Profile ein- oder ausschalten' },
  waipu: { title: 'Waipu-Sender', parent: 'sources', description: 'Sender bei waipu.tv auswählen' },
  joyn: { title: 'Joyn-Sender', parent: 'sources', description: 'Sender bei Joyn auswählen' },
  notifications: { title: 'Mitteilungen', parent: 'overview', description: 'Beobachtete Titel und Erinnerungen · Profil' },
  connections: { title: 'Verbindungen', parent: 'overview', description: 'Netzlaufwerke und TMDB · Gerät und Konto' },
}

export function settingsParent(page) { return SETTINGS_PAGES[page]?.parent || null }
export function settingsChildren(page) { return Object.entries(SETTINGS_PAGES).filter(([, value]) => value.parent === page) }
export function settingsNeedStations(page) { return page === 'waipu' || page === 'joyn' }
