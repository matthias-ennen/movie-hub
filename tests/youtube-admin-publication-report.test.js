import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyYoutubePublishedReports } from '../scripts/verify-published-data.mjs'

const route = {
  kind: 'moviehub-youtube-verified-title-routes',
  schemaVersion: 1, providerId: 'youtube', count: 0, entries: [],
}
const base = {
  kind: 'moviehub-youtube-curated-source-status',
  sourcePlaylistCount: 3,
  playlistIds: [
    'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ',
    'PLJWJS8p_IeEo',
    'PLUGwm4p6v-gI',
  ],
  fullyScanned: true,
  inventoryVideoIds: 180,
  approvedDEOfferRoutes: 0,
}

async function fixture(source, callback) {
  const dir = await mkdtemp(join(tmpdir(), 'moviehub-youtube-admin-verify-'))
  try {
    await writeFile(join(dir, 'youtube-verified-title-routes.json'), JSON.stringify(route))
    await writeFile(join(dir, 'youtube-curated-source-status.json'), JSON.stringify(source))
    return await callback(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('#13 admin-configured YouTube playlist publication gate', () => {
  it('accepts three and more valid unique playlists, including R&B and additional types', async () => {
    for (const count of [1, 2, 3, 4]) {
      const ids = [...base.playlistIds]
      if (count === 4) ids.push('PLabcdefghijklmnop123456')
      const source = { ...base, playlistIds: ids.slice(0, count), sourcePlaylistCount: count }
      await fixture(source, async directory => {
        await expect(verifyYoutubePublishedReports({ directory, prepared: true }))
          .resolves.toEqual({ directRoutes: 0, sourceReportAvailable: true })
      })
    }
  })

  it('checks exact public content after hosting publication', async () => {
    await fixture(base, async directory => {
      const fetchImpl = vi.fn(async url => ({
        ok: true,
        json: async () => url.pathname.includes('source-status') ? base : route,
      }))
      await expect(verifyYoutubePublishedReports({ directory, fetchImpl }))
        .resolves.toEqual({ directRoutes: 0, sourceReportAvailable: true })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    })
  })

  it('rejects missing, duplicate, invalid and inconsistent playlist evidence', async () => {
    const wrong = [
      { ...base, sourcePlaylistCount: 2 },
      { ...base, sourcePlaylistCount: 0, playlistIds: [] },
      { ...base, playlistIds: [base.playlistIds[0], base.playlistIds[0], base.playlistIds[2]] },
      { ...base, playlistIds: [base.playlistIds[0], 'not-a-youtube-playlist', base.playlistIds[2]] },
      { ...base, fullyScanned: false },
      { ...base, inventoryVideoIds: -1 },
      { ...base, approvedDEOfferRoutes: -1 },
    ]
    for (const source of wrong) {
      await fixture(source, async directory => {
        await expect(verifyYoutubePublishedReports({ directory, prepared: true }))
          .rejects.toThrow('YouTube-Playlist-Quellenbericht im Build ungültig')
      })
    }
  })
})
