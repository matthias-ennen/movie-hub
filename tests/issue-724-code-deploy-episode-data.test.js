import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { restorePublishedYoutubeEpisodeSummary }
  from '../scripts/restore-live-youtube-episode-summary.mjs'
import { verifyYoutubeEpisodeCatalogPublication }
  from '../scripts/verify-youtube-episode-catalog-publication.mjs'
import { restorePublishedYoutubeSearchCompanion }
  from '../scripts/restore-live-youtube-code-projections.mjs'
import { YOUTUBE_SEARCH_PUBLIC_PATHS, verifyYoutubeSearchCompanionPublication }
  from '../scripts/verify-youtube-search-companion-publication.mjs'

const generation = '2026-11-06T18:49:20.000Z'
const summary = {
  kind: 'moviehub-youtube-episode-playlist-source-summary',
  schemaVersion: 1, generatedAt: generation, editorialOnly: true,
  sourceVideoIds: 180, provisionalEpisodeLinks: 1,
  confirmedMetadataProposals: 2, affectedBuckets: ['00'],
  independentlyVerifiedDEOffers: 0, verifiedPlaybackRoutes: 0,
}
const manifest = {
  kind: 'series-season-manifest', version: 1, bucketCount: 256,
  shards: Array.from({ length: 256 }, (_, i) => ({
    bucket: i.toString(16).padStart(2, '0'), count: i === 0 ? 1 : 0,
  })),
  youtubeEpisodePlaylistEnrichment: {
    generatedAt: generation, provisionalEpisodeLinks: 1,
    verificationStatus: 'not-independently-verified',
  },
}
const shard = {
  kind: 'series-season-shard', version: 1, bucket: '00',
  entries: [{
    seriesTmdbId: 2691, seasonNumber: 1,
    episodes: [{
      tmdbId: 211788, episodeNumber: 1,
      youtubePlaylistHint: {
        kind: 'moviehub-youtube-editorial-episode-hint',
        videoId: 'abcdefghijk',
      },
    }],
  }],
}

async function fixture(check) {
  const dir = await mkdtemp(join(tmpdir(), 'moviehub-youtube-summary-'))
  await mkdir(join(dir, 'series-details'))
  await writeFile(join(dir, 'series-details/manifest.json'), JSON.stringify(manifest))
  await writeFile(join(dir, 'series-details/00.json'), JSON.stringify(shard))
  try { await check(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}
function request(payload = summary, { ok = true, type = 'application/json' } = {}) {
  return vi.fn(async () => ({
    ok, headers: { get: () => type }, json: async () => payload,
  }))
}
const destination = dir => join(dir, 'youtube-episode-playlist-summary.json')

describe('#724 code-only deploy preserves canonical YouTube episode generation', () => {
  it('restores exactly the published matching summary without rematching or revoking', async () => {
    await fixture(async dir => {
      const fetchSummary = request()
      const restored = await restorePublishedYoutubeEpisodeSummary({
        publicDir: dir, request: fetchSummary,
      })
      expect(restored).toEqual(summary)
      expect(fetchSummary).toHaveBeenCalledTimes(1)
      expect(String(fetchSummary.mock.calls[0][0])).toContain('/youtube-episode-playlist-summary.json')
      expect(await readFile(destination(dir), 'utf8')).toBe(JSON.stringify(summary) + '\n')
      expect(await verifyYoutubeEpisodeCatalogPublication({ publicDir: dir, prepared: true }))
        .toMatchObject({ provisionalEpisodeLinks: 1, sourceVideos: 180 })
    })
  })

  it('refuses an inconsistent generation instead of replacing the last valid summary', async () => {
    await fixture(async dir => {
      await writeFile(destination(dir), 'already-valid')
      await expect(restorePublishedYoutubeEpisodeSummary({
        publicDir: dir,
        request: request({ ...summary, generatedAt: '2026-11-01T12:00:00.000Z' }),
      })).rejects.toThrow('YOUTUBE_EPISODE_RESTORE_GENERATION_MISMATCH')
      expect(await readFile(destination(dir), 'utf8')).toBe('already-valid')
    })
  })

  it('fails closed on an unavailable or non-JSON hosted source', async () => {
    await fixture(async dir => {
      for (const options of [{ ok: false }, { type: 'text/html' }]) {
        await expect(restorePublishedYoutubeEpisodeSummary({
          publicDir: dir, request: request(summary, options),
        })).rejects.toThrow('YOUTUBE_EPISODE_RESTORE_UNAVAILABLE_OR_NON_JSON')
      }
    })
  })

  it('does not accept an unverified or forged published episode summary', async () => {
    await fixture(async dir => {
      for (const tampered of [
        { ...summary, independentlyVerifiedDEOffers: 1 },
        { ...summary, provisionalEpisodeLinks: 2 },
        { ...summary, affectedBuckets: ['00', '00'] },
        { ...summary, editorialOnly: false },
      ]) {
        await expect(restorePublishedYoutubeEpisodeSummary({
          publicDir: dir, request: request(tampered),
        })).rejects.toThrow('YOUTUBE_EPISODE_RESTORE_GENERATION_MISMATCH')
      }
    })
  })

  it('keeps the workflow QA dependency explicit and separates code-only from source refresh', () => {
    const workflow = readFileSync(new URL('../.github/workflows/deploy-firebase.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('Restore published YouTube episode and film search projections for code-only deploy')
    expect(workflow).toContain('scripts/restore-live-youtube-code-projections.mjs')
    expect(workflow).toContain("steps.youtube_episode_review.outcome == 'success'")
    expect(workflow).toContain("!contains(github.event.head_commit.message, '[youtube-refresh]')")
    expect(workflow).toContain("contains(github.event.head_commit.message, '[youtube-refresh]')")
    expect(workflow).toContain("contains(github.event.head_commit.message, '[episode-refresh]')")
    // Previously this unguarded step overwrote restored 93 editorial hints
    // with the generator's empty fallback when no private source QA was present.
    const editorialStep = workflow.slice(
      workflow.indexOf('- name: Publish provisional YouTube playlist title hints, never verified offers'),
      workflow.indexOf('- name: Stage complete YouTube playlist intake for catalog reconciliation'),
    )
    expect(editorialStep).toContain("steps.youtube_curated_source.outcome == 'success'")
    expect(editorialStep).toContain("steps.youtube_editorial_research.outcome == 'success'")
    expect(editorialStep).toContain('node scripts/generate-youtube-curated-editorial-index.mjs')
    expect(workflow).toContain('Restore published YouTube episode and film search projections for code-only deploy')
    // Optional YouTube outage must not block Waipu/Joyn publication via a missing
    // episode summary. A generated/restored generation still needs full readback.
    expect(workflow).toContain("if: ${{ steps.youtube_episode_catalog.outcome == 'success' || steps.youtube_code_projection_restore.outcome == 'success' }}")
    expect(workflow).toContain("steps.firebase_deploy.outcome == 'success' && (steps.youtube_episode_catalog.outcome == 'success' || steps.youtube_code_projection_restore.outcome == 'success')")
  })
})


const searchGeneration = '2026-11-06T18:51:20.000Z'
const searchNow = Date.parse('2026-11-07T12:00:00.000Z')
const videoId = 'abcdefghijk'
const filmId = 12594
const canonicalFilm = {
  type: 'movie', source: 'tmdb', tmdbId: filmId, id: 'tmdb-movie-' + filmId,
  title: 'Film 12594', description: 'Canonical TMDB metadata',
  posterUrl: 'https://image.tmdb.org/t/p/w500/sample.jpg',
  metadataComplete: true, providerIds: ['youtube'],
}
const searchTriplet = () => [
  {
    kind: 'moviehub-youtube-curated-editorial-title-hints',
    schemaVersion: 1, providerId: 'youtube',
    publicationAuthority: 'editorial-playlist-only',
    generatedAt: searchGeneration, sourceVideoIds: 2,
    verifiedDEOffers: 0, verifiedPlaybackRoutes: 0,
    count: 1, entries: [{
      key: 'movie:' + filmId, mediaType: 'movie', tmdbId: filmId,
      videoId, watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
      playlistMode: 'free', verificationStatus: 'not-independently-verified',
    }],
  },
  {
    kind: 'moviehub-youtube-curated-new-film-metadata',
    schemaVersion: 1, providerId: 'youtube',
    offerVerification: 'editorial-only-not-independent',
    generatedAt: searchGeneration, sourceVideoIds: 2,
    count: 1, entries: [{ tmdbId: filmId, videoId, playlistClass: 'FREE', film: canonicalFilm }],
  },
  {
    kind: 'moviehub-youtube-curated-search-title-metadata',
    schemaVersion: 1, providerId: 'youtube',
    sourceType: 'user-curated-playlists-with-tmdb-metadata',
    offerVerification: 'editorial-only-not-independent',
    generatedAt: searchGeneration, sourceVideoIds: 2,
    count: 1, entries: [{ tmdbId: filmId, film: canonicalFilm }],
  },
]
const searchRequest = (files = searchTriplet(), { cache = 'public, no-store' } = {}) =>
  vi.fn(async uri => ({
    ok: true,
    headers: { get: key => key === 'cache-control' ? cache : 'application/json' },
    json: async () => files[YOUTUBE_SEARCH_PUBLIC_PATHS.findIndex(path => uri.pathname === '/' + path)],
  }))

describe('#724 code-only deploy preserves curated YouTube search companion', () => {
  it('restores the complete validated film search projection with the same canonical generation', async () => {
    await fixture(async dir => {
      const request = searchRequest()
      const result = await restorePublishedYoutubeSearchCompanion({
        publicDir: dir, request, now: searchNow,
      })
      expect(result).toEqual({ published: true, count: 1, revoked: false })
      expect(request).toHaveBeenCalledTimes(3)
      for (const path of YOUTUBE_SEARCH_PUBLIC_PATHS) {
        expect(JSON.parse(await readFile(join(dir, path), 'utf8')))
          .toEqual(searchTriplet()[YOUTUBE_SEARCH_PUBLIC_PATHS.indexOf(path)])
      }
      expect(await verifyYoutubeSearchCompanionPublication({
        directory: dir, prepared: true, now: searchNow,
      })).toMatchObject({ published: true, count: 1 })
    })
  })

  it('rejects mixed source generations without modifying any previous public file', async () => {
    await fixture(async dir => {
      const file = join(dir, YOUTUBE_SEARCH_PUBLIC_PATHS[0])
      await writeFile(file, 'previous published film metadata')
      const mixed = searchTriplet()
      mixed[2] = { ...mixed[2], generatedAt: '2026-11-05T12:00:00.000Z' }
      await expect(restorePublishedYoutubeSearchCompanion({
        publicDir: dir, request: searchRequest(mixed), now: searchNow,
      })).rejects.toThrow('YOUTUBE_SEARCH_COMPANION_BUILD_OR_GENERATION_INVALID')
      expect(await readFile(file, 'utf8')).toBe('previous published film metadata')
    })
  })

  it('rejects cacheable or incomplete hosted companions, never silently revokes films', async () => {
    await fixture(async dir => {
      await expect(restorePublishedYoutubeSearchCompanion({
        publicDir: dir, request: searchRequest(searchTriplet(), { cache: 'max-age=3600' }),
        now: searchNow,
      })).rejects.toThrow('YOUTUBE_SEARCH_RESTORE_UNAVAILABLE_OR_CACHEABLE')
      const missing = searchTriplet()
      missing[1] = null
      await expect(restorePublishedYoutubeSearchCompanion({
        publicDir: dir, request: searchRequest(missing), now: searchNow,
      })).rejects.toThrow()
    })
  })
})
