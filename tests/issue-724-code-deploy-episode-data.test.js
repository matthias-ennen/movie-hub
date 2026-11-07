import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { restorePublishedYoutubeEpisodeSummary }
  from '../scripts/restore-live-youtube-episode-summary.mjs'
import { verifyYoutubeEpisodeCatalogPublication }
  from '../scripts/verify-youtube-episode-catalog-publication.mjs'

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
    expect(workflow).toContain('Restore published YouTube episode summary for code-only deploy')
    expect(workflow).toContain('scripts/restore-live-youtube-episode-summary.mjs')
    expect(workflow).toContain("steps.youtube_episode_review.outcome == 'success'")
    expect(workflow).toContain("!contains(github.event.head_commit.message, '[youtube-refresh]')")
    expect(workflow).toContain("contains(github.event.head_commit.message, '[youtube-refresh]')")
    expect(workflow).toContain("contains(github.event.head_commit.message, '[episode-refresh]')")
  })
})
