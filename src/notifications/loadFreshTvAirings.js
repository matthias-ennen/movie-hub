import { alertTitleKey } from './titleAlertModel.js'

export async function loadFreshTvAirings(item, now = Date.now(), fetchImpl = fetch) {
  const response = await fetchImpl('/waipu-live/index.json', { cache: 'no-store' })
  if (!response.ok) return []
  const index = await response.json()
  const generated = Date.parse(index?.generatedAt)
  if (index?.schemaVersion !== 1 || index?.kind !== 'waipu-live-index' || index?.status !== 'complete'
    || !Number.isFinite(generated) || Math.abs(now - generated) > 48 * 3600000) return []
  const titlesResponse = await fetchImpl('/waipu-live/titles.json', { cache: 'no-store' })
  if (!titlesResponse.ok) return []
  const titles = await titlesResponse.json()
  if (titles?.schemaVersion !== 1 || titles?.kind !== 'waipu-live-titles' || !Array.isArray(titles.entries)) return []
  return titles.entries.find((entry) => alertTitleKey(entry) === alertTitleKey(item))?.airings || []
}
