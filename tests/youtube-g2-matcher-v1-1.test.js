import { describe, expect, it } from 'vitest'
import { scoreCandidate, classifyVideo } from '../scripts/youtube-g1-matcher-v1.mjs'
import { scoreCandidateV11, classifyVideoV11 } from '../scripts/youtube-g2-matcher-v1-1.mjs'

const source = (title, minutes = 93) => ({ title, minutes, category: '30', region: 'allowed' })
const movie = (id, title, year, runtime, original = title) => ({
  id, title, original_title: original, runtime, release_date: year + '-01-01',
  alternative_titles: { titles: [] }, credits: { crew: [] },
})
const review = (video, film) => classifyVideoV11(video, [scoreCandidateV11(video, film)])

describe('YouTube G2 Matcher v1.1 – independent year and work-title evidence (read-only)', () => {
  it('upgrades a literal matching film title without losing independent source-year check', () => {
    const v = source('Vollmacht zum Mord (1975)', 93)
    const film = movie(115555, 'Vollmacht zum Mord', 1975, 93)
    const legacy = scoreCandidate(v, film)
    const next = scoreCandidateV11(v, film)
    expect(legacy.titleLevel).toBe(2)
    expect(next.titleLevel).toBe(4)
    expect(next.titleComparisonMode).toBe('terminal-release-year-separated')
    expect(next.yearHint).toBe(1975)
    expect(next.yearMismatch).toBe(false)
    expect(next.score - legacy.score).toBe(16)
    expect(review(v, film).status).toBe('review-leading-film-hypothesis')
    expect(next.movieIdAccepted).toBeNull()
    expect(next.confirmedDEAvailability).toBe(false)
  })

  it('keeps explicit year conflicts even for exact title after separation', () => {
    const v = source('Vollmacht zum Mord (2012)', 93)
    const film = movie(115555, 'Vollmacht zum Mord', 1975, 93)
    const next = scoreCandidateV11(v, film)
    expect(next.titleLevel).toBe(4)
    expect(next.yearMismatch).toBe(true)
    expect(review(v, film).status).toBe('review-explicit-year-conflict')
  })

  it('does not turn year-like movie titles into false release dates', () => {
    const v = source('2010: The Year We Make Contact', 115.8)
    const film = movie(4437, '2010', 1984, 116, '2010')
    film.alternative_titles.titles = [{ title: '2010: The Year We Make Contact' }]
    const legacy = scoreCandidate(v, film)
    const next = scoreCandidateV11(v, film)
    expect(next).toEqual(legacy)
    expect(next.yearHint).toBeNull()
    expect(next.titleLevel).toBe(4)
  })

  it('does not allow the real false-positive Love is... vs 1941 film as leading', () => {
    const v = source('Liebe ist…', 83)
    const film = movie(983000, 'Liebe ist zollfrei', 1941, 91)
    const oldScore = scoreCandidate(v, film)
    expect(oldScore.titleLevel).toBe(2)
    expect(classifyVideo(v, [oldScore]).status).toBe('review-leading-film-hypothesis')
    const next = review(v, film)
    expect(next.status).toBe('review-partial-title-identity')
    expect(next.confirmedMovieId).toBeNull()
    expect(next.confirmedOffer).toBe(false)
  })

  it('routes remaining alternate US/DE partial title to work-identity review', () => {
    const v = source('Red Phone - Manhunt (2001)', 96)
    const film = movie(11111, 'Special Unit AT 13 - Wettlauf mit dem Tod', 2001, 96, 'The Red Phone: Manhunt')
    const next = scoreCandidateV11(v, film)
    expect(next.titleLevel).toBe(2)
    expect(classifyVideoV11(v, [next]).status).toBe('review-partial-title-identity')
  })

  it('preserves sequel and supplementary-content hard guards', () => {
    const v = source('Rambo II - Der Auftrag (1985)', 96)
    const film = movie(1370, 'Rambo III', 1988, 96)
    const next = scoreCandidateV11(v, film)
    expect(next.sequelConflict).toBe(true)
    expect(review(v, film).status).toBe('review-sequel-or-supplement-conflict')
  })
})
