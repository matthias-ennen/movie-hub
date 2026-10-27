import {describe,it,expect} from 'vitest'
import {buildYoutubeNewFilmCatalogProjection} from '../scripts/youtube-g2-publish-new-film-catalog.mjs'
import {
  mergeYoutubeNewFilmsIntoCatalog,validateYoutubeNewFilmFeed,
} from '../src/catalog/youtubeCuratedNewFilms.js'
import {withVerifiedYoutubeTitleOffer} from '../src/providers/youtubeVerifiedTitlePresentation.js'
import {providerOfferLabel} from '../src/providers/providerOfferLabels.js'
import {selectCuratedEditorialTitleHint} from '../src/providers/youtubeCuratedEditorialIndex.js'
const NOW='2026-10-23T16:25:00Z'
const VIDEO='xlRAr36rWo0'
const movie={
  id:'tmdb-movie-12594',type:'movie',mediaType:'movie',source:'tmdb',
  tmdbId:12594,title:'Wishmaster 2: Evil Never Dies',
  description:'A film sequel with a verified TMDB identity.',
  runtimeMinutes:96,posterUrl:'https://image.tmdb.org/t/p/w500/test.jpg',
  metadataComplete:true,metadataVersion:3,
  providerIds:['youtube'],providerOffers:[{id:'youtube',offerTypes:['ads']}],
}
const inputs=()=>({
  metadataReview:{
    kind:'moviehub-youtube-canonical-new-film-metadata-review',
    schemaVersion:1,publicationPermitted:false,privateArtifact:true,
    newMoviesImported:0,verifiedDEOffers:0,catalogWrites:0,
    totalVideoIds:2,candidatesSelected:1,metadataReviewed:1,metadataPreviewReady:1,
    items:[{
      videoId:VIDEO,tmdbId:12594,playlistClass:'FREE',
      status:'tmdb-metadata-review',tmdb:{
        id:movie.id,title:movie.title,runtimeMinutes:movie.runtimeMinutes,
      },
      workIdentityApproved:false,newMovieImported:false,offerPublished:false,
    }],
  },
  reconciliation:{
    kind:'moviehub-youtube-full-catalog-reconciliation',
    totalVideoIds:2,privateArtifact:true,publicationPermitted:false,
    unaccountedForVideoIds:0,
    entries:[{
      videoId:VIDEO,decision:'new-tmdb-metadata-review',
      strongMetadataCandidate:true,suggestedFilmKey:'movie:12594',
      completeCatalogMembership:'not-in-canonical-inventory',
    },{
      videoId:'1uf2AMrQMk0',decision:'already-linked-editorial',
      strongMetadataCandidate:true,suggestedFilmKey:'movie:10586',
      completeCatalogMembership:'canonical-existing',
    }],
  },
  intake:{
    uniqueVideoIds:2,items:[{
      videoId:VIDEO,playlistClass:'FREE',
      suggestedFilmRef:{mediaType:'movie',tmdbId:12594},
      sourceScreened:true,regionSignal:'unknown',
      sourceTitle:'Wishmaster 2',channelTitle:'Film Channel',
      durationMinutes:92.7,playlistIds:['FREE-PLAYLIST'],
    },{
      videoId:'1uf2AMrQMk0',playlistClass:'FREE',
      suggestedFilmRef:{mediaType:'movie',tmdbId:10586},
      sourceScreened:true,regionSignal:'unknown',
      sourceTitle:'Der Geist und die Dunkelheit',channelTitle:'YouTube Movies',
      durationMinutes:110,playlistIds:['FREE-PLAYLIST'],
    }],
  },
  editorialIndex:{
    kind:'moviehub-youtube-curated-editorial-title-hints',
    schemaVersion:1,providerId:'youtube',
    publicationAuthority:'editorial-playlist-only',
    verifiedDEOffers:0,verifiedPlaybackRoutes:0,
    generatedAt:NOW,sourceVideoIds:2,
    count:1,entries:[{
      key:'movie:10586',mediaType:'movie',tmdbId:10586,
      videoId:'1uf2AMrQMk0',watchUrl:'https://www.youtube.com/watch?v=1uf2AMrQMk0',
      playlistMode:'free',playlistIds:['FREE-PLAYLIST'],
      verificationStatus:'not-independently-verified',
      evidence:'playlist-declared-plus-review-matcher',
    }],
  },
  canonicalTitles:[structuredClone(movie)],now:NOW,
})
const base=()=>({
  source:'tmdb',generatedAt:NOW,providerCatalogs:{
    youtube:{id:'youtube',movieIds:['tmdb-movie-10586'],homeIds:['tmdb-movie-10586'],
      movieCount:1}},
  titles:[{id:'tmdb-movie-10586',type:'movie',tmdbId:10586,title:'The Ghost and the Darkness'}],
  rowDefinitions:[],
})
describe('new YouTube playlist movies use canonical TMDB metadata, no verified access claim',()=>{
  it('publishes a unique metadata film and an EXACT playlist watch hint',()=>{
    const model=buildYoutubeNewFilmCatalogProjection(inputs())
    expect(model.summary).toMatchObject({
      sourceVideos:2,newTmdbFilms:1,editorialLinks:2,
      firestoreWrites:0,independentlyVerifiedDEOffers:0,
    })
    expect(model.filmFeed.entries).toHaveLength(1)
    expect(model.filmFeed.entries[0]).toMatchObject({
      videoId:VIDEO,playlistClass:'FREE',
      film:{id:movie.id,tmdbId:12594,source:'tmdb'},
    })
    const joined=model.editorialIndex.entries.find(e=>e.key==='movie:12594')
    expect(joined).toMatchObject({
      videoId:VIDEO,playlistMode:'free',
      watchUrl:'https://www.youtube.com/watch?v='+VIDEO,
      verificationStatus:'not-independently-verified',
    })
    expect(validateYoutubeNewFilmFeed(model.filmFeed,{now:Date.parse(NOW)})).toBe(true)
    const next=mergeYoutubeNewFilmsIntoCatalog(base(),model.filmFeed,{now:Date.parse(NOW)})
    expect(next.titles.map(x=>x.id)).toEqual(['tmdb-movie-10586','tmdb-movie-12594'])
    expect(next.providerCatalogs.youtube.movieIds).toContain(movie.id)
    const preview=withVerifiedYoutubeTitleOffer(next.titles[1],model.editorialIndex,{
      curatedIndex:model.editorialIndex,now:Date.parse(NOW),
    })
    expect(preview.curatedPlaylistTitleOffer).toMatchObject({playlistMode:'free',videoId:VIDEO})
    expect(providerOfferLabel(preview,'youtube')).toBe('FREE')
    expect(selectCuratedEditorialTitleHint(model.editorialIndex,preview,{now:Date.parse(NOW)}))
      .toMatchObject({target:'https://www.youtube.com/watch?v='+VIDEO,
        verificationStatus:'not-independently-verified'})
    expect(model.filmFeed.entries[0].film.verifiedTitleOffers).toBeUndefined()
  })
  it('links one strong existing personal film without creating a duplicate catalog movie',()=>{
    const x=inputs()
    const videoId='G-ETE-RO7Q4'
    const tmdbId=12212
    x.metadataReview.totalVideoIds=3
    x.reconciliation.totalVideoIds=3
    x.intake.uniqueVideoIds=3
    x.editorialIndex.sourceVideoIds=3
    x.reconciliation.entries.push({
      videoId,decision:'exists-in-complete-catalog-review',
      strongMetadataCandidate:true,suggestedFilmKey:'movie:'+tmdbId,
      completeCatalogMembership:'canonical-existing',
      canonicalSources:['personal-tmdb','profile-state','movie-hub'],
      playlistClass:'FREE',filmIdentityApproved:false,
      newMovieImported:false,verifiedOffer:false,
    })
    x.intake.items.push({
      videoId,playlistClass:'FREE',sourceScreened:true,regionSignal:'unknown',
      suggestedFilmRef:{mediaType:'movie',tmdbId},
      sourceTitle:'Düstere Legenden 2 - Urban Legends: The Final Cut',
      channelTitle:'Netzkino',durationMinutes:96,playlistIds:['FREE-PLAYLIST'],
    })
    const result=buildYoutubeNewFilmCatalogProjection(x)
    expect(result.summary).toMatchObject({
      sourceVideos:3,newTmdbFilms:1,editorialLinks:3,
      additionalExistingCanonicalLinks:1,
      firestoreWrites:0,independentlyVerifiedDEOffers:0,
    })
    expect(result.filmFeed.count).toBe(1) // Existing film was NOT imported again.
    const hint=result.editorialIndex.entries.find(v=>v.tmdbId===tmdbId)
    expect(hint).toMatchObject({
      videoId,watchUrl:'https://www.youtube.com/watch?v='+videoId,
      playlistMode:'free',verificationStatus:'not-independently-verified',
    })
    const personal={type:'movie',tmdbId,title:'Düstere Legenden 2',
      providerIds:[],tmdbProviderOffers:[]}
    const enriched=withVerifiedYoutubeTitleOffer(personal,null,{
      curatedIndex:result.editorialIndex,now:Date.parse(NOW)})
    expect(enriched.curatedPlaylistTitleOffer.videoId).toBe(videoId)
    expect(providerOfferLabel(enriched,'youtube')).toBe('FREE')
    expect(selectCuratedEditorialTitleHint(result.editorialIndex,enriched,{
      now:Date.parse(NOW)}).target).toBe('https://www.youtube.com/watch?v='+videoId)
  })

  it('publishes a unique Heiter playlist link on its EXISTING canonical film, with no duplicate import',()=>{
    const x=inputs()
    const videoId='G-ETE-RO7Q4',tmdbId=117467
    x.metadataReview.totalVideoIds=3
    x.reconciliation.totalVideoIds=3
    x.intake.uniqueVideoIds=3
    x.editorialIndex.sourceVideoIds=3
    x.reconciliation.entries.push({
      videoId,decision:'exists-in-complete-catalog-review',
      strongMetadataCandidate:true,suggestedFilmKey:'movie:'+tmdbId,
      completeCatalogMembership:'canonical-existing',
      canonicalSources:['personal-tmdb','profile-state'],
      playlistClass:'FREE',filmIdentityApproved:false,
      newMovieImported:false,verifiedOffer:false,
    })
    x.intake.items.push({
      videoId,playlistClass:'FREE',sourceScreened:true,regionSignal:'unknown',
      suggestedFilmRef:{mediaType:'movie',tmdbId},
      sourceTitle:"Heiter bis wolkig (ROMANTISCHE KOMÖDIE mit ELYAS M'BAREK, Liebeskomödie ganzer Film Deutsch, ROMCOM)",
      channelTitle:'Film channel',durationMinutes:99.4,playlistIds:['FREE-PLAYLIST'],
    })
    const projection=buildYoutubeNewFilmCatalogProjection(x)
    expect(projection.summary).toMatchObject({
      editorialLinks:3,additionalExistingCanonicalLinks:1,
      independentlyVerifiedDEOffers:0,catalogOrFirestoreDatabaseWrites:undefined,
    })
    expect(projection.filmFeed.count).toBe(1)
    expect(projection.filmFeed.entries.some(e=>e.tmdbId===tmdbId)).toBe(false)
    const hint=projection.editorialIndex.entries.find(e=>e.tmdbId===tmdbId)
    expect(hint).toMatchObject({
      videoId,playlistMode:'free',
      watchUrl:'https://www.youtube.com/watch?v='+videoId,
      verificationStatus:'not-independently-verified',
    })
    const personal={type:'movie',tmdbId,title:'Heiter bis wolkig',
      providerIds:[],tmdbProviderOffers:[]}
    const enriched=withVerifiedYoutubeTitleOffer(personal,null,{
      curatedIndex:projection.editorialIndex,now:Date.parse(NOW)})
    expect(enriched.curatedPlaylistTitleOffer.videoId).toBe(videoId)
    expect(providerOfferLabel(enriched,'youtube')).toBe('FREE')
  })

  it('never links ambiguous duplicated, mismatched, or unverified personal-film references',()=>{
    const setup=()=>{
      const x=inputs()
      x.metadataReview.totalVideoIds=3
      x.reconciliation.totalVideoIds=3
      x.intake.uniqueVideoIds=3
      x.editorialIndex.sourceVideoIds=3
      x.reconciliation.entries.push({
        videoId:'G-ETE-RO7Q4',decision:'exists-in-complete-catalog-review',
        strongMetadataCandidate:true,suggestedFilmKey:'movie:12212',
        completeCatalogMembership:'canonical-existing',
        canonicalSources:['personal-tmdb','movie-hub'],
        playlistClass:'FREE',filmIdentityApproved:false,
        newMovieImported:false,verifiedOffer:false,
      })
      x.intake.items.push({
        videoId:'G-ETE-RO7Q4',playlistClass:'FREE',
        suggestedFilmRef:{mediaType:'movie',tmdbId:12212},
        sourceScreened:true,regionSignal:'unknown',
        durationMinutes:96,sourceTitle:'Düstere Legenden 2',
        playlistIds:['FREE-PLAYLIST'],
      })
      return x
    }
    for(const change of [
      x=>{x.reconciliation.entries[2].canonicalSources=[]},
      x=>{x.reconciliation.entries[2].filmIdentityApproved=true},
      x=>{x.intake.items[2].playlistClass='R&B'},
      x=>{x.intake.items[2].regionSignal='excluded'},
      x=>{x.reconciliation.entries[2].suggestedFilmKey='movie:777'},
      x=>{x.reconciliation.entries.push({
        videoId:'ucRKSNwzM_w',suggestedFilmKey:'movie:12212',
        decision:'work-identity-review'
      })},
    ]){
      const x=setup()
      change(x)
      expect(()=>buildYoutubeNewFilmCatalogProjection(x)).toThrow()
    }
  })

  it('never duplicates an existing film and never rewrites TMDB metadata',()=>{
    const model=buildYoutubeNewFilmCatalogProjection(inputs())
    const existing={...base(),titles:[...base().titles,structuredClone(movie)]}
    const merged=mergeYoutubeNewFilmsIntoCatalog(existing,model.filmFeed,{now:Date.parse(NOW)})
    expect(merged).toBe(existing)
    expect(existing.titles).toHaveLength(2)
  })
  it('rejects incorrect film, changed playlist type, missing poster, entitlement fields or overlap',()=>{
    const corrupt=[
      x=>{x.canonicalTitles[0].tmdbId=99999},
      x=>{x.canonicalTitles[0].posterUrl=null},
      x=>{x.metadataReview.items[0].playlistClass='R&B'},
      x=>{x.reconciliation.entries[0].decision='work-identity-review'},
      x=>{x.editorialIndex.entries.push({
        key:'movie:12594',videoId:VIDEO})},
      x=>{x.intake.items[0].durationMinutes=45},
    ]
    for(const change of corrupt){
      const x=inputs()
      change(x)
      expect(()=>buildYoutubeNewFilmCatalogProjection(x)).toThrow()
    }
    const x=inputs()
    const good=buildYoutubeNewFilmCatalogProjection(x).filmFeed
    const tampered={...good,entries:good.entries.map(e=>({
      ...e,film:{...e.film,verifiedTitleOffers:[{id:'youtube',offerTypes:['free']}]},
    }))}
    expect(validateYoutubeNewFilmFeed(tampered,{now:Date.parse(NOW)})).toBe(false)
    expect(mergeYoutubeNewFilmsIntoCatalog(base(),tampered,{now:Date.parse(NOW)}).titles)
      .toHaveLength(1)
  })
  it('rejects stale data and keeps core catalog if metadata cannot be loaded',()=>{
    const good=buildYoutubeNewFilmCatalogProjection(inputs()).filmFeed
    expect(validateYoutubeNewFilmFeed(good,{now:Date.parse('2026-11-04T16:25:00Z')}))
      .toBe(false)
    expect(mergeYoutubeNewFilmsIntoCatalog(base(),null,{now:Date.parse(NOW)}).titles)
      .toHaveLength(1)
  })
})
