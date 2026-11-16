import { describe, expect, it } from 'vitest'
import { resolveTvDaySourceStatus } from '../src/tv/tvDaySourceStatus.js'

const base = { runtimeStatus: 'ready', runtimeProviderIds: ['waipu', 'joyn', 'air-zdf'] }
describe('TV day readiness is independent across the live adapters', () => {
  it('loads with a direct broadcaster only, even if both aggregators fail', () => {
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: ['air-zdf'],
      waipuStatus: 'unavailable', joynStatus: 'unavailable' })).toBe('ready')
  })
  it('loads with the broadcaster while both aggregator catalogs are loading', () => {
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: ['waipu', 'joyn', 'air-zdf'],
      waipuStatus: 'loading', joynStatus: 'loading' })).toBe('ready')
  })
  it('waits for the runtime and does not assume an unpublished station is available', () => {
    expect(resolveTvDaySourceStatus({ ...base, runtimeStatus: 'loading', enabledProviderIds: ['air-zdf'] })).toBe('loading')
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: ['air-rtl'] })).toBe('unavailable')
  })
  it('continues with either independent aggregator and respects disabled selections', () => {
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: ['waipu'], waipuStatus: 'ready', activeWaipuCount: 5 })).toBe('ready')
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: ['joyn'], joynStatus: 'ready', activeJoynCount: 5 })).toBe('ready')
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: ['waipu'], waipuStatus: 'ready', activeWaipuCount: 0 })).toBe('no-stations')
    expect(resolveTvDaySourceStatus({ ...base, enabledProviderIds: [] })).toBe('no-stations')
  })
})
