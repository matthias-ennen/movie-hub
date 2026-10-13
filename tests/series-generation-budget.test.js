import { afterAll, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map())
const sources = vi.hoisted(() => [])
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async path => {
    const key = String(path).split('/public/')[1]
    if (files.has(key)) return files.get(key)
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  }),
  writeFile: vi.fn(async (path, content) => files.set(String(path).split('/public/')[1], content)),
  mkdir: vi.fn(),
}))
vi.mock('../scripts/live-availability-index.mjs', () => ({ discoverLiveSourceCatalogs: async () => sources }))
vi.stubEnv('TMDB_SERIES_SEASON_ENRICH_LIMIT', '6')
const { generateSeriesDetails } = await import('../scripts/generate-series-details.mjs')
afterAll(() => vi.unstubAllEnvs())

it('teilt das feste Abrufbudget zwischen neuen Staffeln und verifizierten Sprachabgleichen', async () => {
  const old = { kind: 'series-season-detail', version: 1, generatedAt: '2026-10-13T00:00:00Z',
    seriesTmdbId: 2734, seasonNumber: 16, episodes: [
      { tmdbId: 1010787, seasonNumber: 16, episodeNumber: 3, title: 'Minderjährig' },
    ] }
  files.set('series-details/ae.json', JSON.stringify({ kind: 'series-season-shard', version: 1, bucket: 'ae', entries: [old] }))
  files.set('catalog.json', JSON.stringify({ titles: [{ type: 'series', tmdbId: 2734, numberOfSeasons: 26 }] }))
  sources.push({ entries: [{ type: 'series', tmdbId: 2734, numberOfSeasons: 26, airings: [{
    startTime: '2026-10-13T13:45:00Z', stopTime: '2026-10-13T14:30:00Z',
    episode: { seasonNumber: 16, episodeNumber: 3, title: "Producer's Backend" },
  }] }] })
  const fetchSeason = vi.fn(async (_, season, options) => ({ season_number: season,
    episodes: [{ id: options?.language ? 1010787 : 2000000 + season, season_number: season,
      episode_number: options?.language ? 3 : 1, name: options?.language ? "Producer's Backend" : 'Erste Folge' }],
  }))
  const manifest = await generateSeriesDetails({ fetchSeason, now: new Date('2026-10-13T12:00:00Z'), changedTitleKeys: new Set() })
  expect(fetchSeason).toHaveBeenCalledTimes(6)
  expect(fetchSeason.mock.calls.filter(call => call[2]?.language === 'en-US')).toHaveLength(1)
  expect(manifest).toMatchObject({ requestLimit: 6, requestedCount: 6, refreshedCount: 5, aliasRefreshedCount: 1, aliasFailedCount: 0 })
  expect(manifest.availableSeasons[2734]).toHaveLength(6)
  const generated = JSON.parse(files.get('series-details/ae.json')).entries.find(s => s.seasonNumber === 16)
  expect(generated.episodes[0]).toMatchObject({ title: 'Minderjährig', titleAliases: ["Producer's Backend"] })
})
