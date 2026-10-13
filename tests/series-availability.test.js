import { afterEach, describe, expect, it, vi } from 'vitest'
import { availableSeriesSeasons, clearSeriesAvailabilityCache, loadSeriesAvailability } from '../src/catalog/seriesAvailability.js'
import { prepareDetailRequestItem } from '../src/components/detailPresentation.js'
import { buildAvailableSeasons } from '../scripts/series-episode-aliases.mjs'

afterEach(clearSeriesAvailabilityCache)
const response = availableSeasons => ({ ok: true, json: async () => ({ kind: 'series-season-manifest', version: 1, availableSeasons }) })

describe('tatsächlich verfügbare Staffeln', () => {
  it('veröffentlicht nur Staffeln mit nutzbaren Episoden', () => {
    expect(buildAvailableSeasons([
      { seriesTmdbId: 1, seasonNumber: 3, episodes: [{}, {}] },
      { seriesTmdbId: 1, seasonNumber: 1, episodes: [{}] },
      { seriesTmdbId: 2, seasonNumber: 1, episodes: [] },
    ])).toEqual({ 1: [[1, 1], [3, 2]] })
  })
  it('teilt einen Manifestabruf zwischen Serien und unterscheidet leere Daten von fehlendem Manifest', async () => {
    const fetchImpl = vi.fn(async () => response({ 1: [[1, 8]] }))
    expect(await Promise.all([loadSeriesAvailability(1, { fetchImpl }), loadSeriesAvailability(2, { fetchImpl })]))
      .toEqual([[[1, 8]], []])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('erlaubt nach Übertragungsfehlern einen neuen Versuch', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response({ 1: [[1, 3]] }))
    expect(await loadSeriesAvailability(1, { fetchImpl })).toBeNull()
    expect(await loadSeriesAvailability(1, { fetchImpl })).toEqual([[1, 3]])
  })
  it('versteckt vollständig fehlende Daten und erhält nutzbare Teilbestände mit Metadaten', () => {
    const item = { tmdbId: 1, numberOfSeasons: 3, seasons: [{ seasonNumber: 1, posterUrl: '/poster.jpg', episodeCount: 10 }] }
    expect(availableSeriesSeasons({ ...item, availableSeasons: [] })).toEqual([])
    const available = availableSeriesSeasons({ ...item, availableSeasons: [[3, 1], [1, 8], [2, 0], [4, -1]] })
    expect(available.map(s => [s.seasonNumber, s.episodeCount])).toEqual([[1, 8], [3, 1]])
    expect(available[0].posterUrl).toBe('/poster.jpg')
  })
  it('erhält unbekannte Episodenzahlen bei alten Manifesten, filtert aber bestätigte leere Staffeln', () => {
    expect(availableSeriesSeasons({ tmdbId: 1, seasons: [{ seasonNumber: 1, episodeCount: null }, { seasonNumber: 2, episodeCount: 0 }] })
      .map(s => s.seasonNumber)).toEqual([1])
  })
  it('bindet den Bestand an Serien-Details und erzeugt keine zusätzlichen Filmabrufe', async () => {
    const loadAvailability = vi.fn(async () => [])
    const options = { loadComplete: async item => item, loadAvailability, presentArtwork: item => item }
    expect(await prepareDetailRequestItem({ type: 'series', tmdbId: 1 }, options)).toMatchObject({ availableSeasons: [] })
    const movie = { type: 'movie', tmdbId: 2 }
    expect(await prepareDetailRequestItem(movie, options)).toBe(movie)
    expect(loadAvailability).toHaveBeenCalledTimes(1)
  })
})
