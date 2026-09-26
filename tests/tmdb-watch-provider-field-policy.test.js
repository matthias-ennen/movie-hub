import { describe, expect, it } from 'vitest'
import { inspectSourceSchema } from '../src/sources/fieldDiscovery.js'
import { TMDB_WATCH_PROVIDER_FIELD_POLICY } from '../src/sources/policies/tmdbWatchProviderFieldPolicy.js'

describe('TMDB watch-provider field policy', () => {
  it('separates monetization fields, rejected presentation data and retained source ordering', () => {
    const report = inspectSourceSchema({
      results: {
        DE: {
          link: 'https://www.themoviedb.org/movie/11/watch',
          ads: [{
            provider_id: 300,
            provider_name: 'Pluto TV',
            logo_path: '/logo.png',
            display_priority: 12,
            new_future_field: 'value',
          }],
        },
      },
    }, {
      sourceId: 'tmdb-watch-providers',
      policy: TMDB_WATCH_PROVIDER_FIELD_POLICY,
    })

    expect(report.fields.find((field) => field.path === 'results.DE.ads')?.status).toBe('capability')
    expect(report.fields.find((field) => field.path === 'results.DE.ads.logo_path')?.status).toBe('reject')
    expect(report.fields.find((field) => field.path === 'results.DE.ads.display_priority')).toMatchObject({
      severity: 'INFO',
      status: 'extension',
      extensionNamespace: 'tmdb',
    })
    expect(report.fields.find((field) => field.path === 'results.DE.ads.new_future_field')?.severity).toBe('REVIEW')
  })
})
