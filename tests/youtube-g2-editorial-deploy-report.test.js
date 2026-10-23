import {describe,it,expect} from 'vitest'
import {summarizeYoutubeEditorialCatalogPublication}
  from '../scripts/deploy-youtube-editorial-catalog-report-model.mjs'
import {buildWorkflowSummary} from '../scripts/report-workflow-summary.mjs'
const now='2026-10-23T18:00:00.000Z'
const at='2026-10-23T17:53:20.000Z'
function data(){
  const entry=(id,tmdbId,cls)=>({
    videoId:id,tmdbId,playlistClass:cls,
    film:{source:'tmdb',type:'movie',tmdbId,id:'tmdb-movie-'+tmdbId,
      title:'TMDB title',description:'description',posterUrl:'https://image.tmdb.org/film.png',
      metadataComplete:true},
  })
  const films={
    kind:'moviehub-youtube-curated-new-film-metadata',schemaVersion:1,
    providerId:'youtube',sourceType:'user-curated-playlists-with-tmdb-metadata',
    offerVerification:'editorial-only-not-independent',
    generatedAt:at,sourceVideoIds:86,count:6,
    entries:[
      entry('AaAaAaAaAa1',101,'FREE'),
      entry('AaAaAaAaAa2',102,'R&B'),
      entry('AaAaAaAaAa3',103,'FREE'),
      entry('AaAaAaAaAa4',104,'R&B'),
      entry('AaAaAaAaAa5',105,'FREE'),
      entry('AaAaAaAaAa6',106,'FREE'),
    ],
  }
  const hints={
    kind:'moviehub-youtube-curated-editorial-title-hints',
    schemaVersion:1,providerId:'youtube',publicationAuthority:'editorial-playlist-only',
    sourceVideoIds:86,verifiedDEOffers:0,verifiedPlaybackRoutes:0,
    generatedAt:at,count:13,
    entries:[
      ...films.entries.map(x=>({
        videoId:x.videoId,key:'movie:'+x.tmdbId,
        playlistMode:x.playlistClass==='FREE'?'free':'rent-buy',
      })),
      ...Array.from({length:7},(_,i)=>({
        videoId:'ZzZzZzZzZ'+String(i).padStart(2,'0'),
        key:'movie:'+(200+i),playlistMode:'free',
      })),
    ],
  }
  const intake={
    mode:'YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY',
    generatedAt:at,fullScan:true,twoUserDefinedPlaylists:true,
    uniqueVideoIds:86,processedVideoIds:86,unaccountedForVideoIds:0,
    playlistClasses:{FREE:58,'R&B':28},publicationPermitted:false,
  }
  const reconciliation={
    kind:'moviehub-youtube-full-catalog-reconciliation',
    privateArtifact:true,publicationPermitted:false,generatedAt:at,
    totalVideoIds:86,processedVideoIds:86,unaccountedForVideoIds:0,
    catalogCandidateCount:6327,
  }
  return {intake,reconciliation,films,hints}
}
const steps={
  sourceStep:'success',intakeStep:'success',reconcileStep:'success',
  metadataStep:'success',filmStep:'success',publishedStep:'success',
}
describe('YouTube current deployment report uses real published projections',()=>{
  it('shows 86/86, 58 FREE, 28 R&B, six new films, thirteen exact links',()=>{
    const output=summarizeYoutubeEditorialCatalogPublication({
      ...data(),...steps,reportedAt:now})
    expect(output.publicationMeasured).toBe(true)
    expect(output.intake).toMatchObject({
      status:'✅ erfolgreich',
      stock:'86/86 Videos geprüft',
      activity:'58 FREE · 28 R&B',
    })
    expect(output.intake.open).toContain('6.327 kanonische Titelkandidaten')
    expect(output.films).toMatchObject({
      status:'✅ veröffentlicht und zurückgelesen',
      stock:'6 neue TMDB-Filme im MovieHub-Zusatzkatalog',
      activity:'13 konkrete YouTube-Playlist-Links',
    })
    expect(output.films.open).toContain('keine unabhängig bestätigten')
    const workflow=buildWorkflowSummary({
      youtubeCompleteIntake:data().intake,
      youtubeFullCatalog:data().reconciliation,
      youtubeNewFilms:data().films,
      youtubeCuratedHints:data().hints,
      steps:{
        youtubeSync:'success',youtubeIntake:'success',
        youtubeFullCatalog:'success',youtubeNewMetadata:'success',
        youtubeNewFilmCatalog:'success',publication:'success',
      },run:{number:101,reportedAt:now},
    })
    expect(workflow.rows.find(x=>x.area==='YouTube → TMDB-Neutitel').stock)
      .toContain('6 neue TMDB-Filme')
    expect(workflow.rows.find(x=>x.area==='YouTube · vollständiger Playlist-Intake').stock)
      .toBe('86/86 Videos geprüft')
  })
  it('never reports fabricated 0 or verified DE offers when deployment evidence is missing',()=>{
    for(const input of [
      {...data(),hints:null},
      {...data(),films:null},
      {...data(),intake:null},
      {...data(),reconciliation:null},
      {...data(),films:{...data().films,count:7}},
      {...data(),hints:{...data().hints,verifiedDEOffers:1}},
    ]){
      const o=summarizeYoutubeEditorialCatalogPublication({
        ...input,...steps,reportedAt:now})
      expect(o.publicationMeasured).toBe(false)
      expect(o.films.stock).toBe('Neutitel-Veröffentlichung nicht bestätigt')
    }
  })
  it('separates failed publication from successful read-only intake',()=>{
    const o=summarizeYoutubeEditorialCatalogPublication({
      ...data(),...steps,filmStep:'failure',reportedAt:now})
    expect(o.publicationMeasured).toBe(false)
    expect(o.intake.status).toBe('✅ erfolgreich')
    expect(o.films.status).toBe('❌ fehlgeschlagen')
    expect(o.films.stock).toBe('Neutitel-Veröffentlichung nicht bestätigt')
  })
  it('fails closed on stale counts rather than invent current live results',()=>{
    const o=summarizeYoutubeEditorialCatalogPublication({
      ...data(),...steps,reportedAt:'2026-10-26T12:00:00.000Z'})
    expect(o.publicationMeasured).toBe(false)
    expect(o.intake.stock).toBe('Playlist-Intake nicht bestätigt')
  })
})
