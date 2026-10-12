import { PROVIDER_REGISTRY } from './providerRegistry.js'

const primaryIds = ['moviehub', 'waipu', 'joyn']
const primaryRank = new Map(primaryIds.map((id, index) => [id, index]))
const byId = new Map(PROVIDER_REGISTRY.map((provider) => [provider.id, provider]))

export function compareProviderIds(left, right) {
  return (primaryRank.get(left) ?? primaryIds.length) - (primaryRank.get(right) ?? primaryIds.length)
    || String(byId.get(left)?.label || left).localeCompare(String(byId.get(right)?.label || right), 'de', { sensitivity: 'base' })
    || String(left).localeCompare(String(right))
}

export const ORDERED_PROVIDERS = [...PROVIDER_REGISTRY].sort((left, right) => compareProviderIds(left.id, right.id))

export function orderProviderIds(providerIds = [], { includeMovieHub = false } = {}) {
  return [...new Set([
    ...(includeMovieHub ? ['moviehub'] : []),
    ...(Array.isArray(providerIds) ? providerIds : []),
  ].map((id) => String(id ?? '').trim()).filter(Boolean))].sort(compareProviderIds)
}
