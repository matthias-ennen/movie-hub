import { describe, it, expect, vi } from 'vitest'
import {
  runCuratedTmdbMembership, validateCuratedTmdbInputs,
  explicitAlternateWorkFormRisk,
} from '../scripts/youtube-g2-curated-tmdb-membership.mjs'

const AT = '2026-10-22T16:50:00.000Z'
const ID_FREE = 'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const ID_RENT = 'PLJWJS8p_IeEo'
const available = {
  videoId: '8VDNOwUBRHo', videoTitle: 'Terrified', minutes: 88.1,
  playlistModes: ['free'], editorialOfferHint: 'free',
  status: 'review-tmdb-work-identity', screened: true,
  deRegionSignal: 'allowed', accepted: false, toImport: false,
  playbackRoute: null, verifiedOfferType: null,
}
const missing = {
  ...available, videoId: 'xWkLYgaorAI', videoTitle: null, minutes: null,
  status: 'review-video-missing-or-private', screened: false,
}
const both = {
  ...available, videoId: 'PZC6NS-IFCk', videoTitle: 'The Amateur',
  minutes: 122.6, playlistModes: ['free','rent-buy'],
  status: 'review-tmdb-work-identity', editorialOfferHint: 'free',
}
function qa(cases = [available, missing, both]) {
  return {
    mode: 'CURATED_TWO_PLAYLISTS_READ_ONLY',
    observedAt: '2026-10-22T16:47:34.710Z',
    fullyScanned: true, publicationPermitted: false,
    playlistSummaries: [
      { mode: 'free', playlistId: ID_FREE, fullyScanned: true },
      { mode: 'rent-buy', playlistId: ID_RENT, fullyScanned: true },
    ],
    uniqueVideoIds: cases.length, candidates: cases,
    catalogWrites: 0, firestoreWrites: 0, providerWrites: 0,
    badgeWrites: 0, nightlyWrites: 0,
  }
}
const idx = (ids=[100]) => ({
  kind: 'search-index', version: 1, country: 'DE', source: 'published',
  generatedAt: '2026-10-22T15:10:00.000Z',
  entries: ids.map(tmdbId => ({type:'movie', tmdbId, title:'Terrified'})),
  count: ids.length,
})
const tmdb = vi.fn(async (path, params) => {
  if (path === '/search/movie') return {results:[{id:100}]}
  if (path === '/search/tv') return {results:[]}
  if (path === '/movie/100') return {
    id:100,title:'Terrified',original_title:'Terrified',runtime:88,
    release_date:'2017-01-01', alternative_titles:{titles:[]},credits:{cast:[]},
  }
  throw Error('Unexpected TMDB route ' + path + ' ' + JSON.stringify(params))
})
describe('G2 curated playlist exact IDs -> TMDB-only identity hypotheses', () => {
  it('preserves all IDs, analyzes only source-eligible videos and never publishes', async () => {
    tmdb.mockClear()
    const result = await runCuratedTmdbMembership({
      audit: qa(), publicIndex: idx(), tmdbGet: tmdb, now: () => AT,
    })
    expect(result.summary).toMatchObject({
      processedRows:3, sourceVideoIds:3,
      matcherVersion:'v1.1+explicit-cast+alternate-work-form-review',
      verifiedFilms:0, verifiedDEOffers:0, newMovieImports:0,
      publicationPermitted:false, catalogWrites:0, firestoreWrites:0,
      badgeWrites:0, providerWrites:0, nightlyWrites:0,
      publicIndexOnly:true,
    })
    expect(result.rows.map(x=>x.videoId))
      .toEqual([available.videoId,missing.videoId,both.videoId])
    expect(result.rows[0].topCandidates[0].tmdbId).toBe(100)
    expect(result.rows[0].publicIndexMembership).toBe('public-present')
    expect(result.rows[1]).toMatchObject({
      matchStatus:'review-no-eligible-video-details',
      publicIndexMembership:'unknown', toImport:false,
    })
    expect(result.rows[2]).toMatchObject({
      hasPlaylistOverlap:true, hasPlaylistOfferConflict:false,
      editorialOfferHint:'free',
      verifiedOfferType:null, playbackRoute:null, publicationPermitted:false,
    })
    expect(tmdb.mock.calls.every(c=> /^\/(?:search\/(?:movie|tv)|movie\/\d+)$/.test(c[0]))).toBe(true)
  })
  it('not-present in PUBLIC index is not labeled a new film', async () => {
    const out = await runCuratedTmdbMembership({
      audit:qa([available]),publicIndex:idx([999]),tmdbGet:tmdb,now:()=>AT,
    })
    expect(out.rows[0].publicIndexMembership).toBe('public-not-present')
    expect(out.rows[0].toImport).toBe(false)
    expect(out.summary.newMovieImports).toBe(0)
  })
  it('handles at most 100 exact IDs (not the outdated 50-ID limit)', () => {
    const hundred=Array.from({length:100},(_,i)=>({
      ...available,videoId:String(i).padStart(11,'0'),
    }))
    expect(()=>validateCuratedTmdbInputs(qa(hundred),idx(),AT)).not.toThrow()
    expect(()=>validateCuratedTmdbInputs(qa([...hundred,{
      ...available,videoId:'A0000000000',
    }]),idx(),AT)).toThrow('CURATED_QA_PROVENANCE')
  })
  it('holds explicit alternate adaptations for separate identity review, never a leading original-film match', async () => {
    const suspicious={...available,videoId:'5ky33JjGTao',
      videoTitle:'ICE AGE 2 JETZT TAUTS GANZER FILM 2026 (SPIELVERFILMUNG) 4K Ultra',
      minutes:107.8, deRegionSignal:'unknown'}
    expect(explicitAlternateWorkFormRisk(suspicious.videoTitle)).toBe('explicit-alternate-work-form')
    expect(explicitAlternateWorkFormRisk('The Amateur')).toBeNull()
    const output=await runCuratedTmdbMembership({
      audit:qa([suspicious]),publicIndex:idx(),tmdbGet:tmdb,now:()=>AT,
    })
    expect(output.rows[0]).toMatchObject({
      matchStatus:'review-explicit-alternate-work-form',
      identityRisk:'explicit-alternate-work-form',
      toImport:false, verifiedDEPlayback:false, publicationPermitted:false,
    })
    expect(output.summary.alternateWorkFormRisks).toBe(1)
    expect(output.summary.verifiedFilms).toBe(0)
  })
  it('keeps real 2-character IT video ID for manual work review with zero TMDB calls', async () => {
    tmdb.mockClear()
    const source={...available,videoId:'OXXkaZvKPjw',videoTitle:'IT',minutes:135.5}
    const out=await runCuratedTmdbMembership({
      audit:qa([source]),publicIndex:idx(),tmdbGet:tmdb,now:()=>AT,
    })
    expect(out.summary).toMatchObject({
      processedRows:1,tmdbCalls:0,verifiedFilms:0,verifiedDEOffers:0,
      newMovieImports:0,publicationPermitted:false,
    })
    expect(out.rows[0]).toMatchObject({
      videoId:'OXXkaZvKPjw',videoTitle:'IT',
      matchStatus:'review-short-ambiguous-title',
      topCandidates:[],tmdbQueries:[],verifiedTmdbId:null,
      playbackRoute:null,toImport:false,
    })
    expect(tmdb).not.toHaveBeenCalled()
  })

  it('fails closed for stale/incomplete/tampered source QA and noncanonical index', () => {
    expect(()=>validateCuratedTmdbInputs(
      {...qa(),fullyScanned:false},idx(),AT,
    )).toThrow('CURATED_QA_PROVENANCE')
    expect(()=>validateCuratedTmdbInputs(
      {...qa(),firestoreWrites:1},idx(),AT,
    )).toThrow('CURATED_QA_PROVENANCE')
    expect(()=>validateCuratedTmdbInputs(
      qa([{...available,editorialOfferHint:'rent-buy'}]),idx(),AT,
    )).toThrow('CURATED_QA_PROVENANCE')
    expect(()=>validateCuratedTmdbInputs(
      {...qa(),playlistSummaries:[
        {mode:'free',playlistId:'PL_NOT_OURS',fullyScanned:true},
        {mode:'rent-buy',playlistId:ID_RENT,fullyScanned:true},
      ]},idx(),AT,
    )).toThrow('CURATED_QA_PROVENANCE')
    expect(()=>validateCuratedTmdbInputs(
      {...qa(),observedAt:'2026-10-01T00:00:00Z'},idx(),AT,
    )).toThrow('CURATED_QA_EXPIRED')
    expect(()=>validateCuratedTmdbInputs(
      qa(),{...idx(),country:'US'},AT,
    )).toThrow('PUBLISHED_MOVIEHUB_INDEX_INVALID')
  })
})
