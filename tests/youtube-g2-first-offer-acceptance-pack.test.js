import {describe,it,expect} from 'vitest'
import {
  PILOT_CASES,buildFirstOfferAcceptancePack,renderFirstOfferAcceptancePack,
} from '../scripts/youtube-g2-first-offer-acceptance-pack.mjs'

const NOW='2026-10-23T09:48:00.000Z'
const ids=['1uf2AMrQMk0','ucRKSNwzM_w','3csAkKfa6Vs']
const make=()=>{
  const source={
    audit:{
      mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:NOW,
      uniqueVideoIds:3,fullyScanned:true,publicationPermitted:false,
      candidates:ids.map((videoId,i)=>({
        videoId,videoTitle:['Der Geist und die Dunkelheit',
          'Freitag der 13. - Das letzte Kapitel','Deep Star Six'][i],
        channelTitle:'Sample channel',channelId:'UCabcdefghijklmnopqrstuv',
        editorialOfferHint:i===2?'rent-buy':'free',
        playlistModes:[i===2?'rent-buy':'free'],
        playlistIds:[i===2?'PLJWJS8p_IeEo':'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'],
        minutes:[110,91.3,99.6][i],deRegionSignal:'allowed',
        status:'review-tmdb-work-identity',screened:true,
        accepted:false,toImport:false,verifiedOfferType:null,playbackRoute:null,
      })),
    },
  }
  const research={summary:{
    mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
    generatedAt:'2026-10-23T09:49:00.000Z',sourceQAObservedAt:NOW,
    sourceVideoIds:3,processedRows:3,publicationPermitted:false,
    verifiedFilms:0,verifiedDEOffers:0,newMovieImports:0,
  },rows:source.audit.candidates.map((c,i)=>({
    videoId:c.videoId,sourceStatus:c.status,
    editorialOfferHint:c.editorialOfferHint,playlistModes:c.playlistModes,
    publicationPermitted:false,verifiedTmdbId:null,playbackRoute:null,
    matchStatus:i===1?'review-multiple-film-works':'review-leading-film-hypothesis',
    topCandidates:[{tmdbId:[10586,9730,11607][i],score:40,runtimeDelta:1}],
  }))}
  return {source,research}
}

describe('YouTube G2 first manually verified offer pilot (QA only)',()=>{
  it('creates 3 exact video-ID links with original source provenance, never approval',()=>{
    const {source,research}=make()
    const out=buildFirstOfferAcceptancePack(source,research)
    expect(out).toMatchObject({
      processedSourceIds:3,publicationPermitted:false,
      approvalBundleCreated:false,verifiedOffers:0,
      catalogWrites:0,firestoreWrites:0,badgeWrites:0,routeWrites:0,
    })
    expect(out.candidates.map(c=>c.videoId)).toEqual(ids)
    expect(out.candidates.map(c=>c.watchUrl)).toEqual(
      ids.map(id=>'https://www.youtube.com/watch?v='+id))
    expect(out.candidates.map(c=>c.editorialOfferHint)).toEqual(['free','free','rent-buy'])
    expect(out.candidates[1].researchStatus).toBe('review-multiple-film-works')
    for(const c of out.candidates){
      expect(c).toMatchObject({
        verificationStatus:'not-tested',approved:false,
        verifiedOfferType:null,playbackRoute:null,
      })
      expect(Object.values(c.observations).every(v=>v===null)).toBe(true)
    }
    const report=renderFirstOfferAcceptancePack(out)
    expect(report).toContain('Fire TV')
    expect(report).toContain('Nutzungsberechtigung')
    expect(report).toContain('KEINEN Tarif')
    for(const id of ids)expect(report).toContain('watch?v='+id)
    expect(JSON.stringify(out)).not.toContain('"sourceUseAuthorized":true')
  })

  it('rejects stale/misaligned research, lost evidence and omitted candidates',()=>{
    const {source,research}=make()
    research.summary.sourceQAObservedAt='2026-10-22T09:48:00.000Z'
    expect(()=>buildFirstOfferAcceptancePack(source,research))
      .toThrow('YOUTUBE_PILOT_ORIGINAL_QA_MISMATCH_OR_UNVERIFIED')
    research.summary.sourceQAObservedAt=NOW
    research.rows.splice(1,1)
    expect(()=>buildFirstOfferAcceptancePack(source,research))
      .toThrow('YOUTUBE_PILOT_ORIGINAL_QA_MISMATCH_OR_UNVERIFIED')
  })

  it('fails closed on unverified source, changed playlist mode, excluded region or missing pilot video',()=>{
    const {source,research}=make()
    source.audit.candidates[0].editorialOfferHint='rent-buy'
    expect(()=>buildFirstOfferAcceptancePack(source,research))
      .toThrow('YOUTUBE_PILOT_CASE_NOT_SAFE_OR_MISSING')
    source.audit.candidates[0].editorialOfferHint='free'
    source.audit.candidates[0].deRegionSignal='excluded'
    expect(()=>buildFirstOfferAcceptancePack(source,research))
      .toThrow('YOUTUBE_PILOT_CASE_NOT_SAFE_OR_MISSING')
    source.audit.candidates[0].deRegionSignal='allowed'
    source.audit.candidates[0].accepted=true
    expect(()=>buildFirstOfferAcceptancePack(source,research))
      .toThrow('YOUTUBE_PILOT_ORIGINAL_QA_MISMATCH_OR_UNVERIFIED')
    source.audit.candidates[0].accepted=false
    expect(()=>buildFirstOfferAcceptancePack(source,research,{
      cases:[...PILOT_CASES,{videoId:'NotKnown000',mode:'free'}],
    })).toThrow('YOUTUBE_PILOT_CASE_NOT_SAFE_OR_MISSING')
  })
})
