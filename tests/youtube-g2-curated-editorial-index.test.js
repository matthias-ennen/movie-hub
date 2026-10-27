import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
  buildCuratedEditorialTitleIndex,selectCuratedEditorialTitleHint,
  hasDominantFilmHypothesis,hasExclusiveSourceActorFilmHypothesis,
} from '../src/providers/youtubeCuratedEditorialIndex.js'
import {withVerifiedYoutubeTitleOffer} from '../src/providers/youtubeVerifiedTitlePresentation.js'
import {resolveProviderPresentation} from '../src/providers/providerPresentation.js'
import {resolvePosterProviderModel} from '../src/providers/posterProviderModel.js'
import {providerOfferLabel} from '../src/providers/providerOfferLabels.js'
import {buildDetailStreamingProviderIds} from '../src/components/detailProviderPresentation.js'
import {ProviderBadge} from '../src/components/ProviderBadges.jsx'
import {launchProviderPlaybackRoute} from '../src/providers/providerPlaybackLaunch.js'
import {providers,getProviderDestination} from '../src/data/catalog.js'
import {resetProviderSelectionSnapshot} from '../src/settings/providerSelectionRuntime.js'
const AT='2026-10-23T11:00:00.000Z'
const FREE='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const RB='PLJWJS8p_IeEo'
const TITLE='Der Geist und die Dunkelheit'
const VID='1uf2AMrQMk0'
const SECOND='3csAkKfa6Vs'
const make=()=>{
  const candidates=[
    {videoId:VID,videoTitle:TITLE,channelTitle:'YouTube Movies',channelId:'UCfilm',
      playlistModes:['free'],playlistIds:[FREE],editorialOfferHint:'free',
      status:'review-tmdb-work-identity',screened:true,deRegionSignal:'allowed',
      accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null},
    {videoId:SECOND,videoTitle:'Deep Star Six',channelTitle:'YouTube Movies',channelId:'UCfilm',
      playlistModes:['rent-buy'],playlistIds:[RB],editorialOfferHint:'rent-buy',
      status:'review-tmdb-work-identity',screened:true,deRegionSignal:'unknown',
      accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null},
  ]
  const audit={mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:AT,fullyScanned:true,
    publicationPermitted:false,uniqueVideoIds:candidates.length,candidates,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0}
  const research={summary:{
    mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
    generatedAt:'2026-10-23T11:01:00.000Z',
    sourceQAObservedAt:AT,sourceVideoIds:candidates.length,processedRows:candidates.length,
    publicIndexOnly:true,publicationPermitted:false,
    verifiedFilms:0,verifiedDEOffers:0,newMovieImports:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  },rows:candidates.map((c,i)=>({
    videoId:c.videoId,editorialOfferHint:c.editorialOfferHint,sourceStatus:c.status,
    playlistModes:c.playlistModes,hasPlaylistOfferConflict:false,hasPlaylistOverlap:false,
    identityRisk:null,publicIndexMembership:'public-present',
    matchStatus:'review-leading-film-hypothesis',alternativeTvIds:[],errors:[],
    topCandidates:[{tmdbId:i===0?10586:11607,titleLevel:4,score:40,
      runtimeDelta:1,yearMismatch:false,sequelConflict:false}],
    publicationPermitted:false,verifiedTmdbId:null,verifiedOfferType:null,
    playbackRoute:null,
  }))}
  return {audit,research}
}
const item=(id=10586)=>({type:'movie',tmdbId:id,title:TITLE,
  tmdbProviderIds:[],tmdbProviderOffers:[],providerIds:[]})
beforeEach(()=>resetProviderSelectionSnapshot({loading:false}))

describe('YouTube G2 provisional FREE/R&B playlist classifications, NEVER verified',()=>{
  it('links exact real FREE video + R&B title as playlist-declared badges without question marks and deep links',()=>{
    const {audit,research}=make()
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index).toMatchObject({count:2,sourceVideoIds:2,
      classificationCounts:{free:1,'rent-buy':1},
      verifiedDEOffers:0,verifiedPlaybackRoutes:0,
      publicationAuthority:'editorial-playlist-only'})
    const g=withVerifiedYoutubeTitleOffer(item(),null,{curatedIndex:index,now:Date.parse(AT)})
    expect(g).toMatchObject({
      curatedPlaylistTitleOffer:{id:'youtube',playlistMode:'free',
        videoId:VID,provenance:'playlist-declared-not-verified'}})
    expect(g).not.toHaveProperty('verifiedTitleOffers')
    const poster=resolvePosterProviderModel(g)
    expect(poster.providerIds).toEqual(['youtube'])
    expect(poster.offerLabels.youtube).toBe('FREE')
    const presentation=resolveProviderPresentation(g)
    expect(presentation.verifiedTitleProviderIds).toEqual([])
    expect(presentation.editorialTitleProviderIds).toEqual(['youtube'])
    expect(buildDetailStreamingProviderIds(presentation,providers,[],g)).toEqual(['youtube'])
    const markup=renderToStaticMarkup(createElement(ProviderBadge,{
      providerId:'youtube',item:g,
    }))
    expect(markup).toContain('Nur Playlist-Zuordnung')
    expect(markup).toContain('FREE')
    expect(markup).toContain('noch nicht unabhängig geprüft')
    const hint=selectCuratedEditorialTitleHint(index,item(),{now:Date.parse(AT)})
    expect(hint).toMatchObject({target:'https://www.youtube.com/watch?v='+VID,
      playlistMode:'free',verificationStatus:'not-independently-verified'})
    const bridge={openProviderRoute:vi.fn()}
    const fallback=getProviderDestination('youtube',TITLE)
    expect(launchProviderPlaybackRoute({providerId:'youtube',title:TITLE,
      route:hint,fallbackUrl:fallback,nativeBridge:bridge})).toBe(true)
    expect(bridge.openProviderRoute).toHaveBeenCalledWith('youtube',TITLE,
      'APP_DEEP_LINK','title','https://www.youtube.com/watch?v='+VID,fallback)
    const r=withVerifiedYoutubeTitleOffer(item(11607),null,{
      curatedIndex:index,now:Date.parse(AT)})
    expect(providerOfferLabel(r,'youtube')).toBe('R&B')
  })

  it('shows R&B for the EXACT Deep Star Six playlist video even when TMDB reports YouTube ADS',()=>{
    // Real app observation: movie:11607 displays TMDB ADS, but its exact video
    // 3csAkKfa6Vs originates from the user-defined Rent & Buy playlist.
    const {audit,research}=make()
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    const tmdb={...item(11607),title:'Deep Star Six',
      tmdbProviderIds:['youtube','prime','pluto'],
      tmdbProviderOffers:[{id:'youtube',offerTypes:['ads']},
        {id:'prime',offerTypes:['flatrate']}]}
    const original=structuredClone(tmdb)
    const enriched=withVerifiedYoutubeTitleOffer(tmdb,null,{
      curatedIndex:index,now:Date.parse(AT)})
    expect(providerOfferLabel(tmdb,'youtube')).toBe('ADS')
    expect(providerOfferLabel(enriched,'youtube')).toBe('R&B')
    const poster=resolvePosterProviderModel(enriched)
    expect(poster.offerLabels.youtube).toBe('R&B')
    expect(buildDetailStreamingProviderIds(resolveProviderPresentation(enriched),
      providers,[],enriched)).toContain('youtube')
    const rendered=renderToStaticMarkup(createElement(ProviderBadge,{
      providerId:'youtube',item:enriched}))
    expect(rendered).toContain('R&amp;B')
    expect(rendered).toContain('Nur Playlist-Zuordnung')
    expect(selectCuratedEditorialTitleHint(index,tmdb,{now:Date.parse(AT)}))
      .toMatchObject({target:'https://www.youtube.com/watch?v='+SECOND,
        playlistMode:'rent-buy'})
    expect(tmdb).toEqual(original) // TMDB ADS data is not rewritten.
  })

  it('keeps TMDB label if no exact curated video is matched',()=>{
    const tmdb={...item(11607),tmdbProviderIds:['youtube'],
      tmdbProviderOffers:[{id:'youtube',offerTypes:['ads']}]}
    expect(providerOfferLabel(withVerifiedYoutubeTitleOffer(tmdb,null),
      'youtube')).toBe('ADS')
  })

  it('uses FREE priority when the SAME video ID appears in both playlists',()=>{
    const {audit,research}=make()
    audit.candidates[0].playlistModes=['free','rent-buy']
    audit.candidates[0].playlistIds=[FREE,RB]
    research.rows[0].playlistModes=['free','rent-buy']
    research.rows[0].hasPlaylistOverlap=true
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index.entries.find(x=>x.tmdbId===10586).playlistMode).toBe('free')
  })
  it('accepts clear dominant exact film when TMDB also returns a weak unrelated secondary result',()=>{
    const {audit,research}=make()
    // Live example: Hidden Figures top movie score=40 exact, unrelated
    // runner score=-7 and titleLevel=2. Keep source video provenance intact.
    research.rows[0].topCandidates=[
      {tmdbId:10586,titleLevel:4,score:40,runtimeDelta:0.5,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:199999,titleLevel:2,score:-7,runtimeDelta:89,
        yearMismatch:false,sequelConflict:false},
    ]
    const result=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(result.entries.find(x=>x.tmdbId===10586)).toMatchObject({
      key:'movie:10586',videoId:VID,playlistMode:'free',
    })
    expect(result.entries.some(x=>x.tmdbId===199999)).toBe(false)
  })

  it('keeps an exact film with TWO clearly unrelated weak search hits',()=>{
    const {audit,research}=make()
    // Real-data shape: Cold Skin / The Resident / Transsiberian:
    // exact strong primary, two weak side hits, no TV or edition warnings.
    research.rows[0].topCandidates=[
      {tmdbId:10586,titleLevel:4,score:50,runtimeDelta:1,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:100001,titleLevel:2,score:12,runtimeDelta:70,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:100002,titleLevel:0,score:-10,runtimeDelta:95,
        yearMismatch:false,sequelConflict:false},
    ]
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index.entries.find(x=>x.key==='movie:10586')).toMatchObject({
      videoId:VID,playlistMode:'free',
    })
    expect(index.count).toBe(2)
  })

  it.each([
    ['Heat',949,40,0.5,[
      [136795,7,2,53.5],[1108566,7,2,75.5]]],
    ['The Equalizer',156022,40,1,[
      [550001,19,2,11],[550002,7,2,29]]],
    ['Smile 2',1100782,38,4.4,[
      [988843,-1,1,121.6],[1433770,-1,1,117.6]]],
    ['Der Name der Rose',192,40,0.3,[
      [776669,7,2,82.3]]],
  ])('one MOVIE-playlist batch links a dominant %s film despite fuzzy TV search suggestions',
    (title,tmdbId,score,runtimeDelta,alternatives)=>{
      const {audit,research}=make()
      audit.candidates[0].videoTitle=title
      research.rows[0].matchStatus='review-leading-movie-with-TV-alternatives'
      research.rows[0].alternativeTvIds=[222,333]
      research.rows[0].topCandidates=[
        {tmdbId,titleLevel:4,score,runtimeDelta,
          yearMismatch:false,sequelConflict:false},
        ...alternatives.map(([id,s,l,d])=>({
          tmdbId:id,score:s,titleLevel:l,runtimeDelta:d,
          yearMismatch:false,sequelConflict:false,
        })),
      ]
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.find(entry=>entry.tmdbId===tmdbId)).toMatchObject({
        key:'movie:'+tmdbId,videoId:VID,playlistMode:'free',
        watchUrl:'https://www.youtube.com/watch?v='+VID,
      })
      expect(index.verifiedPlaybackRoutes).toBe(0)
      const hint=selectCuratedEditorialTitleHint(index,item(tmdbId),{now:Date.parse(AT)})
      expect(hint?.target).toBe('https://www.youtube.com/watch?v='+VID)
    })

  it('keeps ambiguous film matches, weak movie identity and invalid source out of TV-noise batch',()=>{
    for(const unsafe of [
      r=>{r.topCandidates[0].runtimeDelta=5.1},
      r=>{r.topCandidates[0].score=37},
      r=>{r.topCandidates[0].titleLevel=3},
      r=>{r.topCandidates[1].score=25},
      r=>{r.topCandidates[1].titleLevel=4},
      r=>{r.topCandidates[0].yearMismatch=true},
      r=>{r.alternativeTvIds=[]},
      r=>{r.alternativeTvIds=null},
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.publicIndexMembership='public-not-present'},
      r=>{r.matchStatus='review-multiple-film-works'},
      (r,a)=>{a.screened=false},
      (r,a)=>{a.deRegionSignal='excluded'},
      (r,a)=>{a.playlistIds=[]},
    ]){
      const {audit,research}=make()
      const row=research.rows[0]
      row.matchStatus='review-leading-movie-with-TV-alternatives'
      row.alternativeTvIds=[888]
      row.topCandidates=[
        {tmdbId:10586,titleLevel:4,score:40,runtimeDelta:1,
          yearMismatch:false,sequelConflict:false},
        {tmdbId:199999,titleLevel:2,score:0,runtimeDelta:90,
          yearMismatch:false,sequelConflict:false},
      ]
      unsafe(row,audit.candidates[0])
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.some(e=>e.key==='movie:10586')).toBe(false)
    }
  })

  it.each([
    ['The Watcher Thriller mit Keanu Reeves Ganzer Film',10685,'Keanu Reeves',
      50,4.1,[[421049,18,4,3.9],[437375,15,4,10.1]]],
    ["Heiter bis wolkig (ROMANTISCHE KOMÖDIE mit ELYAS M'BAREK, Liebeskomödie ganzer Film Deutsch, ROMCOM)",
      117467,"ELYAS M'BAREK",52,0.6,[[1071608,3,4,89.4],[1090200,-4,2,null]]],
  ])('supports only source-credited actor-exclusive %s in MOVIE-playlist matching',
    (source,tmdbId,explicitActor,score,runtimeDelta,runners)=>{
      const {audit,research}=make()
      const row=research.rows[0]
      audit.candidates[0].videoTitle=source
      row.matchStatus='review-leading-movie-with-TV-alternatives'
      row.alternativeTvIds=[210232]
      row.castEvidence={
        explicitActor, actorCreditEvidence:'matched-a-tmdb-credit-list',
        creditedMovieIds:[tmdbId],affectsRanking:true,
      }
      row.topCandidates=[
        {tmdbId,titleLevel:4,score,runtimeDelta,yearMismatch:false,
          sequelConflict:false,quotedActorCreditMatches:true},
        ...runners.map(([id,otherScore,titleLevel,otherDelta])=>({
          tmdbId:id,score:otherScore,titleLevel,
          runtimeDelta:otherDelta,yearMismatch:false,
          sequelConflict:false,quotedActorCreditMatches:false,
        })),
      ]
      // The historical gate already accepts Heiter (the rival runtime
      // differs by 89 min), but not Watcher (a close-runtime rival).
      expect(hasDominantFilmHypothesis(row.topCandidates))
        .toBe(tmdbId===117467)
      expect(hasExclusiveSourceActorFilmHypothesis(
        row.topCandidates,row.castEvidence)).toBe(true)
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.find(e=>e.key==='movie:'+tmdbId))
        .toMatchObject({videoId:VID,playlistMode:'free',
          watchUrl:'https://www.youtube.com/watch?v='+VID})
      expect(selectCuratedEditorialTitleHint(index,item(tmdbId),{
        now:Date.parse(AT)})).toMatchObject({
          videoId:VID,playlistMode:'free',
          verificationStatus:'not-independently-verified',
        })
      expect(index.verifiedDEOffers).toBe(0)
      // Actual Heiter metadata has not entered the public Movie Hub index.
      // Exclusive cast proof must not override that separate requirement.
      row.publicIndexMembership='public-not-present'
      expect(buildCuratedEditorialTitleIndex(audit,research,{now:AT})
        .entries.some(e=>e.tmdbId===tmdbId)).toBe(false)
    })

  it('never treats unique actor labels as a way around any identity/safety proof',()=>{
    const before=[
      {tmdbId:10685,score:50,titleLevel:4,runtimeDelta:4.1,
        yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:true},
      {tmdbId:421049,score:18,titleLevel:4,runtimeDelta:3.9,
        yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:false},
      {tmdbId:437375,score:15,titleLevel:4,runtimeDelta:10.1,
        yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:false},
    ]
    const cast={
      explicitActor:'Keanu Reeves',actorCreditEvidence:'matched-a-tmdb-credit-list',
      creditedMovieIds:[10685],affectsRanking:true,
    }
    const changes=[
      (r,c)=>{c.actorCreditEvidence='not-corroborated-in-candidates'},
      (r,c)=>{c.creditedMovieIds=[]},
      (r,c)=>{c.creditedMovieIds=[10685,421049]},
      (r,c)=>{c.creditedMovieIds=[421049]},
      (r,c)=>{c.explicitActor='Keanu'},
      (r,c)=>{delete c.explicitActor},
      (r,c)=>{r[0].quotedActorCreditMatches=null},
      (r,c)=>{r[1].quotedActorCreditMatches=null},
      (r,c)=>{r[1].quotedActorCreditMatches=true},
      (r,c)=>{r[1].score=26},
      (r,c)=>{r[0].score=49},
      (r,c)=>{r[0].runtimeDelta=5.1},
      (r,c)=>{r[0].titleLevel=3},
      (r,c)=>{r[0].yearMismatch=true},
      (r,c)=>{r[0].sequelConflict=true},
      (r,c)=>{r[2].tmdbId=10685},
      (r,c)=>{r.push({...r[2],tmdbId:9991})},
    ]
    for(const mutate of changes){
      const scores=structuredClone(before), evidence=structuredClone(cast)
      mutate(scores,evidence)
      expect(hasExclusiveSourceActorFilmHypothesis(scores,evidence)).toBe(false)
    }
    for(const mutate of [
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.publicIndexMembership='public-not-present'},
      r=>{r.hasPlaylistOfferConflict=true},
      r=>{r.errors=['TMDB-timeout']},
      r=>{r.matchStatus='review-multiple-film-works'},
      r=>{r.alternativeTvIds=[]},
    ]){
      const {audit,research}=make()
      const r=research.rows[0]
      r.topCandidates=structuredClone(before)
      r.castEvidence=structuredClone(cast)
      r.matchStatus='review-leading-movie-with-TV-alternatives'
      r.alternativeTvIds=[210232]
      mutate(r)
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.some(e=>e.tmdbId===10685)).toBe(false)
    }
  })

  it('preserves the actual Marvins Töchter film when two billed actors beat synthetic rivals',()=>{
    const {audit,research}=make()
    const row=research.rows[0]
    audit.candidates[0].videoTitle='Marvins Töchter 4K Leonardo DiCaprio & Meryl Streep Kostenloser Film in voller Länge'
    row.castEvidence={
      explicitActor:null,explicitActors:['Leonardo DiCaprio','Meryl Streep'],
      actorCreditEvidence:'matched-exclusive-two-actor-credit-list',
      creditedMovieIds:[9819],partiallyCreditedMovieIds:[],affectsRanking:true,
    }
    row.topCandidates=[
      {tmdbId:9819,titleLevel:4,score:52,runtimeDelta:1,
        yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:true},
      {tmdbId:9000002,titleLevel:4,score:18,runtimeDelta:7,
        yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:false},
      {tmdbId:9000003,titleLevel:4,score:12,runtimeDelta:21,
        yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:false},
    ]
    const result=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(result.entries.find(x=>x.tmdbId===9819)).toMatchObject({
      key:'movie:9819',videoId:VID,
      watchUrl:'https://www.youtube.com/watch?v='+VID,
      playlistMode:'free',verificationStatus:'not-independently-verified',
    })
    row.castEvidence.partiallyCreditedMovieIds=[9000002]
    expect(buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      .entries.some(x=>x.tmdbId===9819)).toBe(false)
  })

  it('matches an exact film from its reported 1960 year without choosing a wrong remake',()=>{
    const {audit,research}=make()
    audit.candidates[0].videoTitle='Die Zeit Maschine - 1960'
    const r=research.rows[0]
    r.topCandidates=[
      {tmdbId:2134,titleLevel:4,score:44,runtimeDelta:1.9,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:148948,titleLevel:4,score:28,runtimeDelta:2.1,
        yearMismatch:true,sequelConflict:false},
      {tmdbId:2135,titleLevel:4,score:26,runtimeDelta:5.1,
        yearMismatch:true,sequelConflict:false},
    ]
    const found=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(found.entries.find(x=>x.tmdbId===2134)).toMatchObject({
      videoId:VID,playlistMode:'free',
      watchUrl:'https://www.youtube.com/watch?v='+VID,
      verificationStatus:'not-independently-verified',
    })
    expect(found.entries.some(x=>x.tmdbId===148948||x.tmdbId===2135)).toBe(false)
    r.topCandidates[1].yearMismatch=false
    const unsafe=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(unsafe.entries.some(x=>x.tmdbId===2134)).toBe(false)
    r.topCandidates[1].yearMismatch=true
    audit.candidates[0].videoTitle='The Time Machine'
    expect(buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      .entries.some(x=>x.tmdbId===2134)).toBe(false)
  })

  it('projects Friday 1980 with year-conflicting remake AND weak third film, never a verified R&B route',()=>{
    const {audit,research}=make()
    audit.candidates[1].videoTitle='Friday the 13th (1980)'
    const row=research.rows[1]
    row.topCandidates=[
      {tmdbId:4488,titleLevel:4,score:44,runtimeDelta:0.3,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:13207,titleLevel:4,score:28,runtimeDelta:1.7,
        yearMismatch:true,sequelConflict:false},
      {tmdbId:9728,titleLevel:2,score:24,runtimeDelta:0.3,
        yearMismatch:false,sequelConflict:false},
    ]
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index.entries.find(x=>x.tmdbId===4488)).toMatchObject({
      videoId:SECOND,playlistMode:'rent-buy',
      watchUrl:'https://www.youtube.com/watch?v='+SECOND,
      verificationStatus:'not-independently-verified',
    })
    expect(index.verifiedDEOffers).toBe(0)
    row.topCandidates[2].titleLevel=4
    expect(buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      .entries.some(x=>x.tmdbId===4488)).toBe(false)
  })

  it('keeps remake and TV ambiguities in review even with a strong primary',()=>{
    for(const unsafe of [
      r=>{r.topCandidates[2].score=32},
      r=>{r.topCandidates[2].titleLevel=4},
      r=>{r.topCandidates[1].score=40},
      r=>{r.alternativeTvIds=[922]},
      r=>{r.topCandidates.push({...r.topCandidates[2],tmdbId:100003})},
    ]){
      const {audit,research}=make()
      const row=research.rows[0]
      row.topCandidates=[
        {tmdbId:10586,titleLevel:4,score:50,runtimeDelta:1,
          yearMismatch:false,sequelConflict:false},
        {tmdbId:100001,titleLevel:2,score:12,runtimeDelta:90,
          yearMismatch:false,sequelConflict:false},
        {tmdbId:100002,titleLevel:0,score:-10,runtimeDelta:100,
          yearMismatch:false,sequelConflict:false},
      ]
      unsafe(row)
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.some(x=>x.key==='movie:10586')).toBe(false)
    }
  })

  it('rejects near-ties, plausible remakes, TV alternatives and >3 TMDB movie hits',()=>{
    for(const changed of [
      r=>{r.topCandidates[1].score=25},
      r=>{r.topCandidates[1].titleLevel=4},
      r=>{r.topCandidates.push(
        {...r.topCandidates[1],tmdbId:89000},
        {...r.topCandidates[1],tmdbId:89001},
      )},
      r=>{r.alternativeTvIds=[800]},
      r=>{r.topCandidates[0].runtimeDelta=11},
      r=>{r.topCandidates[0].titleLevel=3},
    ]){
      const {audit,research}=make()
      const source=research.rows[0]
      source.topCandidates=[
        {tmdbId:10586,titleLevel:4,score:40,runtimeDelta:1,
          yearMismatch:false,sequelConflict:false},
        {tmdbId:199999,titleLevel:2,score:10,runtimeDelta:90,
          yearMismatch:false,sequelConflict:false},
      ]
      changed(source)
      const result=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(result.entries.some(x=>x.tmdbId===10586)).toBe(false)
    }
  })

  it('rejects conflicting video IDs for the same movie rather than guess a playback link',()=>{
    const {audit,research}=make()
    research.rows[1].topCandidates[0].tmdbId=10586
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(index.count).toBe(0)
    expect(index.skippedAmbiguousMovieKeys).toBe(1)
  })
  it('does not surface ambiguous works, partial videos, region exclusions or non-public-index guesses',()=>{
    for(const change of [
      (a,r)=>{r.matchStatus='review-multiple-film-works'},
      (a,r)=>{r.topCandidates.push({...r.topCandidates[0],tmdbId:45})},
      (a,r)=>{r.publicIndexMembership='public-not-present'},
      (a,r)=>{r.alternativeTvIds=[1]},
      (a,r)=>{r.identityRisk='explicit-alternate-work-form'},
      (a,r)=>{r.topCandidates[0].runtimeDelta=35},
      (a,r)=>{a.screened=false},
      (a,r)=>{a.deRegionSignal='excluded'},
    ]){
      const {audit,research}=make()
      change(audit.candidates[0],research.rows[0])
      const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
      expect(index.entries.find(e=>e.tmdbId===10586)).toBeUndefined()
    }
  })
  it('rejects misaligned/modified QA, never upgrades it to verified',()=>{
    const {audit,research}=make()
    audit.candidates[0].editorialOfferHint='rent-buy'
    expect(()=>buildCuratedEditorialTitleIndex(audit,research,{now:AT}))
      .toThrow('CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
    audit.candidates[0].editorialOfferHint='free'
    research.summary.sourceQAObservedAt='2026-10-22T00:00:00Z'
    expect(()=>buildCuratedEditorialTitleIndex(audit,research,{now:AT}))
      .toThrow('CURATED_EDITORIAL_SOURCE_OR_RESEARCH_UNTRUSTED')
  })
  it('drops expired, forged, wrong-title and previously injected preview fields',()=>{
    const {audit,research}=make()
    const index=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    expect(selectCuratedEditorialTitleHint(index,item(),{
      now:Date.parse('2026-11-03T10:00:00.000Z')})).toBeNull()
    expect(selectCuratedEditorialTitleHint(index,item(17),{now:Date.parse(AT)})).toBeNull()
    expect(selectCuratedEditorialTitleHint({...index,publicationAuthority:'verified'},
      item(),{now:Date.parse(AT)})).toBeNull()
    expect(selectCuratedEditorialTitleHint({...index,verifiedDEOffers:1},
      item(),{now:Date.parse(AT)})).toBeNull()
    const forged={...item(),curatedPlaylistTitleOffer:{id:'youtube',
      playlistMode:'free',provenance:'playlist-declared-not-verified'}}
    const cleared=withVerifiedYoutubeTitleOffer(forged,null,{now:Date.parse(AT)})
    expect(cleared).not.toHaveProperty('curatedPlaylistTitleOffer')
  })
  it('gives independently VERIFIED offers higher priority and never copies a fake playlist hint',()=>{
    const {audit,research}=make()
    const curated=buildCuratedEditorialTitleIndex(audit,research,{now:AT})
    const verified={kind:'moviehub-youtube-verified-title-routes',
      schemaVersion:1,providerId:'youtube',count:1,entries:[{
        key:'movie:10586',tmdbId:10586,mediaType:'movie',
        verifiedVideoId:VID,target:'https://www.youtube.com/watch?v='+VID,
        accessType:'ads',verifiedAt:AT,validUntil:'2026-10-29T11:00:00.000Z',
      }]}
    const output=withVerifiedYoutubeTitleOffer(item(),verified,{
      curatedIndex:curated,now:Date.parse(AT)})
    expect(output).not.toHaveProperty('curatedPlaylistTitleOffer')
    expect(providerOfferLabel(output,'youtube')).toBe('ADS')
  })
})
