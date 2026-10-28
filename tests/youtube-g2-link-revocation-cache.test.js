import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {
  buildCuratedEditorialTitleIndex,selectCuratedEditorialTitleHint,
} from '../src/providers/youtubeCuratedEditorialIndex.js'

const AT='2026-10-28T08:00:00.000Z'
const FREE='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const RB='PLJWJS8p_IeEo'
const ids=['AAAAA123456','BBBBB123456']
const film=id=>({type:'movie',tmdbId:id})
const candidate=(videoId,mode)=>({
  videoId,videoTitle:'Film '+videoId,channelTitle:'Publisher',
  channelId:'UCpublished',playlistModes:[mode],
  playlistIds:[mode==='free'?FREE:RB],editorialOfferHint:mode,
  status:'review-tmdb-work-identity',screened:true,
  deRegionSignal:'allowed',accepted:false,toImport:false,
  playbackRoute:null,verifiedOfferType:null,
})
function fixture(){
  const audit={
    mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:AT,
    fullyScanned:true,publicationPermitted:false,uniqueVideoIds:2,
    candidates:[candidate(ids[0],'free'),candidate(ids[1],'rent-buy')],
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  }
  const research={
    summary:{
      mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
      generatedAt:'2026-10-28T08:00:30.000Z',sourceQAObservedAt:AT,
      sourceVideoIds:2,processedRows:2,publicIndexOnly:true,
      publicationPermitted:false,verifiedFilms:0,verifiedDEOffers:0,
      newMovieImports:0,catalogWrites:0,firestoreWrites:0,
      providerWrites:0,badgeWrites:0,nightlyWrites:0,
    },
    rows:audit.candidates.map((c,i)=>({
      videoId:c.videoId,editorialOfferHint:c.editorialOfferHint,
      sourceStatus:c.status,playlistModes:c.playlistModes,
      hasPlaylistOfferConflict:false,hasPlaylistOverlap:false,
      identityRisk:null,publicIndexMembership:'public-present',
      matchStatus:'review-leading-film-hypothesis',alternativeTvIds:[],
      errors:[],topCandidates:[{
        tmdbId:101+i,score:40,titleLevel:4,runtimeDelta:1,
        yearMismatch:false,sequelConflict:false,
      }],
      publicationPermitted:false,verifiedTmdbId:null,
      verifiedOfferType:null,playbackRoute:null,
    })),
  }
  return {audit,research}
}
const build=({audit,research})=>buildCuratedEditorialTitleIndex(audit,research,{
  now:'2026-10-28T08:01:00.000Z',
})
describe('YouTube exact playlist links: source removal and no-store delivery',()=>{
  it('declares all revocable YouTube public feeds no-store at Firebase Hosting',()=>{
    const config=JSON.parse(readFileSync(
      new URL('../firebase.json',import.meta.url),'utf8'))
    for(const path of [
      '/youtube-verified-title-routes.json',
      '/youtube-curated-source-status.json',
      '/youtube-curated-title-hints.json',
      '/youtube-curated-new-films.json',
      '/youtube-best-effort-title-links.json',
    ]){
      const matching=config.hosting.headers.filter(x=>x.source===path)
      expect(matching,path).toHaveLength(1)
      expect(matching[0].headers).toContainEqual({
        key:'Cache-Control',value:'no-store',
      })
    }
    expect(config.hosting.rewrites).toContainEqual({
      source:'**',destination:'/index.html',
    })
  })
  it('removes a previously published exact watch URL on the next full source generation',()=>{
    const {audit,research}=fixture()
    const before=build({audit,research})
    expect(before.entries).toHaveLength(2)
    expect(selectCuratedEditorialTitleHint(before,film(101),{
      now:Date.parse('2026-10-28T08:01:00Z'),
    })?.videoId).toBe(ids[0])
    expect(selectCuratedEditorialTitleHint(before,film(102),{
      now:Date.parse('2026-10-28T08:01:00Z'),
    })?.videoId).toBe(ids[1])

    // The FULL official playlist sync no longer contains one previously linked ID.
    // Both the API inventory and its derived TMDB QA must agree before publication.
    audit.candidates= audit.candidates.filter(c=>c.videoId!==ids[0])
    audit.uniqueVideoIds=1
    research.rows=research.rows.filter(x=>x.videoId!==ids[0])
    research.summary.sourceVideoIds=1
    research.summary.processedRows=1
    const updated=build({audit,research})
    expect(updated.entries).toHaveLength(1)
    expect(updated.entries[0].videoId).toBe(ids[1])
    expect(selectCuratedEditorialTitleHint(updated,film(101),{
      now:Date.parse('2026-10-28T08:01:00Z'),
    })).toBeNull()
    expect(selectCuratedEditorialTitleHint(updated,film(102),{
      now:Date.parse('2026-10-28T08:01:00Z'),
    })?.videoId).toBe(ids[1])
    expect(updated.verifiedDEOffers).toBe(0)
  })
  it('fails closed on an incomplete playlist scan rather than treating missing rows as removals',()=>{
    const {audit,research}=fixture()
    audit.fullyScanned=false
    expect(()=>build({audit,research})).toThrow(
      'CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
    audit.fullyScanned=true
    research.rows.pop()
    research.summary.processedRows=1
    expect(()=>build({audit,research})).toThrow(
      'CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
  })
  it('refuses stale public links when current source cannot refresh',()=>{
    const index=build(fixture())
    expect(selectCuratedEditorialTitleHint(index,film(101),{
      now:Date.parse('2026-11-05T08:01:00Z'),
    })).toBeNull()
  })
})
