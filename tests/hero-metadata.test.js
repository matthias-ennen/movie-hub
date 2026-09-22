import { describe, expect, it, vi } from 'vitest'
import { heroNeedsCanonicalMetadata, resolveHeroMetadata } from '../src/components/heroMetadata.js'
import { selectHeroTrailer, selectHeroVideo } from '../src/components/heroTrailer.js'

const completeChecks = {
  details: 'present',
  artwork: 'present',
  ageRating: 'present',
  credits: 'present',
  keywords: 'present',
  videos: 'present',
  providers: 'present',
  collection: 'absent',
}

function completeMovie(item, videos) {
  return {
    ...item,
    metadataVersion: 3,
    metadataComplete: true,
    metadataChecks: completeChecks,
    collectionChecked: true,
    videos,
  }
}

describe('kanonische Hero-Metadaten', () => {
  it('lädt für einen kompakten persönlichen Titel den veröffentlichten Trailer nach', async () => {
    const compact = {
      id: 'tmdb-movie-762441',
      tmdbId: 762441,
      type: 'movie',
      title: 'A Quiet Place: Tag Eins',
      metadataVersion: 3,
      metadataComplete: true,
    }
    const trailer = { type: 'trailer', site: 'youtube', key: 'xHhhaWyuXhQ' }
    const teaser = { type: 'teaser', site: 'youtube', key: 'x6MfbZM5Zmk' }
    const loadTitle = vi.fn(async () => completeMovie(compact, [trailer, teaser]))

    const resolved = await resolveHeroMetadata(compact, { loadTitle })

    expect(heroNeedsCanonicalMetadata(compact)).toBe(true)
    expect(loadTitle).toHaveBeenCalledWith(compact, {
      requireContract: true,
      requireComplete: false,
    })
    expect(selectHeroVideo(resolved.videos)).toBe(trailer)
    expect(selectHeroTrailer(resolved.videos)).toBe(trailer)
  })

  it('übernimmt auch für Buddy haut den Lukas denselben Trailer wie die Detailansicht', async () => {
    const compact = {
      id: 'tmdb-movie-11039',
      tmdbId: 11039,
      type: 'movie',
      title: 'Buddy haut den Lukas',
    }
    const trailer = { type: 'trailer', site: 'youtube', key: '-sxAfmZkcKQ' }

    const resolved = await resolveHeroMetadata(compact, {
      loadTitle: async () => completeMovie(compact, [trailer]),
    })

    expect(selectHeroVideo(resolved.videos)).toBe(trailer)
    expect(selectHeroTrailer(resolved.videos)).toBe(trailer)
  })

  it('lädt einen bereits vollständigen Hero nicht erneut', async () => {
    const complete = completeMovie({
      id: 'tmdb-movie-11039',
      tmdbId: 11039,
      type: 'movie',
      title: 'Buddy haut den Lukas',
    }, [])
    const loadTitle = vi.fn()

    await expect(resolveHeroMetadata(complete, { loadTitle })).resolves.toBe(complete)
    expect(heroNeedsCanonicalMetadata(complete)).toBe(false)
    expect(loadTitle).not.toHaveBeenCalled()
  })
})
