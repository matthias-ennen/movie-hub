export const PROVIDER_OPTIONS = [
  {
    id: 'netflix',
    label: 'Netflix',
    short: 'N',
    group: 'Streaming',
    description: 'Netflix-Inhalte und Netflix-Anbieterbutton anzeigen.',
  },
  {
    id: 'prime',
    label: 'Prime Video',
    short: 'P',
    group: 'Streaming',
    description: 'Prime-Video-Inhalte und Prime-Video-Anbieterbutton anzeigen.',
  },
  {
    id: 'disney',
    label: 'Disney+',
    short: 'D+',
    group: 'Streaming',
    description: 'Disney+-Inhalte und Disney+-Anbieterbutton anzeigen.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    short: 'YT',
    group: 'Streaming',
    description: 'YouTube-Inhalte und YouTube-Anbieterbutton anzeigen.',
  },
  {
    id: 'waipu',
    label: 'waipu.tv',
    short: 'W',
    group: 'Streaming',
    description: 'waipu.tv/Waiputhek berücksichtigen, soweit strukturierte Daten verfügbar sind.',
  },
]

export const DEFAULT_ENABLED_PROVIDER_IDS = PROVIDER_OPTIONS.map((provider) => provider.id)

const providerIdSet = new Set(DEFAULT_ENABLED_PROVIDER_IDS)

export function normalizeEnabledProviderIds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_PROVIDER_IDS]
  const requested = new Set(value.filter((providerId) => providerIdSet.has(providerId)))
  return DEFAULT_ENABLED_PROVIDER_IDS.filter((providerId) => requested.has(providerId))
}

export function providerIdForRowTitle(title) {
  const normalized = String(title || '').toLocaleLowerCase('de')
  if (!normalized) return null
  if (normalized.includes('netflix')) return 'netflix'
  if (normalized.includes('prime video')) return 'prime'
  if (normalized.includes('disney+')) return 'disney'
  if (normalized.includes('youtube')) return 'youtube'
  if (normalized.includes('waiputhek') || normalized.includes('waipu.tv')) return 'waipu'
  return null
}
