import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {describe,it,expect,vi} from 'vitest'
import {verifyYoutubeEditorialFilmPublication} from '../scripts/verify-published-data.mjs'
import {YOUTUBE_NEW_FILMS_MAX_ENTRIES} from '../src/catalog/youtubeCuratedNewFilms.js'

const NOW='2026-10-23T16:40:00.000Z'
const FILM=12594
const VIDEO='xlRAr36rWo0'
const WATCH='https://www.youtube.com/watch?v='+VIDEO
const hint={
  key:'movie:'+FILM,mediaType:'movie',tmdbId:FILM,
  videoId:VIDEO,watchUrl:WATCH,playlistMode:'free',
  playlistIds:['PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'],
  verificationStatus:'not-independently-verified',
  evidence:'playlist-declared-plus-review-matcher',
}
const hints={
  kind:'moviehub-youtube-curated-editorial-title-hints',
  schemaVersion:1,providerId:'youtube',
  publicationAuthority:'editorial-playlist-only',
  generatedAt:NOW,sourceVideoIds:86,verifiedDEOffers:0,
  verifiedPlaybackRoutes:0,count:1,entries:[hint],
}
const feed={
  kind:'moviehub-youtube-curated-new-film-metadata',
  schemaVersion:1,providerId:'youtube',
  sourceType:'user-curated-playlists-with-tmdb-metadata',
  offerVerification:'editorial-only-not-independent',
  generatedAt:NOW,sourceVideoIds:86,count:1,
  entries:[{
    videoId:VIDEO,tmdbId:FILM,playlistClass:'FREE',
    film:{type:'movie',source:'tmdb',tmdbId:FILM,
      id:'tmdb-movie-'+FILM,title:'Wishmaster 2',
      description:'Fiktive Beschreibung für technischen Test.',
      posterUrl:'https://image.tmdb.org/t/p/w500/example.jpg',metadataComplete:true},
  }],
}
const H='youtube-curated-title-hints.json'
const F='youtube-curated-new-films.json'
async function withSnapshot(action,{h=hints,f=feed}={}){
  const dir=await mkdtemp(join(tmpdir(),'youtube-editorial-pub-'))
  try{
    if(h)await writeFile(join(dir,H),JSON.stringify(h))
    if(f)await writeFile(join(dir,F),JSON.stringify(f))
    return await action(dir)
  }finally{await rm(dir,{recursive:true,force:true})}
}
const fetchMatching=()=>vi.fn(async url=>({
  ok:true,json:async()=>String(url.pathname).includes('new-films')?structuredClone(feed):structuredClone(hints),
}))
describe('readback exactly published YouTube FREE/R&B film metadata and watch URLs',()=>{
  it('requires same exact source-linked snapshot both prepared and after publish',async()=>{
    await withSnapshot(async directory=>{
      expect(await verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .toEqual({feedPresent:true,newFilmTitles:1,editorialLinks:1})
      const fetchImpl=fetchMatching()
      expect(await verifyYoutubeEditorialFilmPublication({directory,fetchImpl}))
        .toEqual({feedPresent:true,newFilmTitles:1,editorialLinks:1})
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      const paths=fetchImpl.mock.calls.map(([url])=>url.pathname)
      expect(paths).toEqual(['/'+H,'/'+F])
    })
  })
  it('fails if the source film feed exists but the companion playlist routes do not',async()=>{
    await withSnapshot(async directory=>{
      await expect(verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .rejects.toThrow('snapshots inconsistent')
    },{h:null})
  })
  it('does not invent successful publication when both sources are absent',async()=>{
    await withSnapshot(async directory=>{
      expect(await verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .toEqual({feedPresent:false,editorialLinks:null,newFilmTitles:null})
    },{h:null,f:null})
  })
  it('rejects video-ID, FREE-vs-R&B, TMDB identity, or bogus verified offer inconsistencies',async()=>{
    for(const mutated of [
      {h:{...hints,entries:[{...hint,videoId:'Zaaaaaaaaaa'}]}},
      {h:{...hints,entries:[{...hint,playlistMode:'rent-buy'}]}},
      {f:{...feed,entries:[{...feed.entries[0],tmdbId:338912}]}},
      {h:{...hints,verifiedDEOffers:1}},
      {f:{...feed,offerVerification:'verified'}},
    ]){
      await withSnapshot(async directory=>{
        await expect(verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
          .rejects.toThrow()
      },mutated)
    }
  })
  it('fails the Firebase readback if remote files differ from successfully built JSON',async()=>{
    await withSnapshot(async directory=>{
      const wrongRemote=vi.fn(async url=>({
        ok:true,
        json:async()=>String(url.pathname).includes('new-films')
          ?{...feed,count:0}:structuredClone(hints),
      }))
      await expect(verifyYoutubeEditorialFilmPublication({directory,fetchImpl:wrongRemote}))
        .rejects.toThrow('Published generation differs from build: '+F)
      const missingRemote=vi.fn(async()=>({ok:false}))
      await expect(verifyYoutubeEditorialFilmPublication({directory,fetchImpl:missingRemote}))
        .rejects.toThrow('YouTube publication not reachable')
    })
  })

  it('accepts the exact failed six-playlist-scale snapshot of 325 new films and 841 editorial links',async()=>{
    // Nightly #20 had exactly these counts. A legacy 50-film verification cap
    // must not discard an otherwise valid, internally linked publication.
    const totalFilms=325,totalHints=841
    const makeVideo=i=>'V'+String(i).padStart(10,'0')
    const records=Array.from({length:totalHints},(_,i)=>{
      const tmdbId=100000+i,videoId=makeVideo(i)
      return {
        key:'movie:'+tmdbId,mediaType:'movie',tmdbId,videoId,
        watchUrl:'https://www.youtube.com/watch?v='+videoId,
        playlistMode:i%2===0?'free':'rent-buy',
        verificationStatus:'not-independently-verified',
        evidence:'playlist-declared-plus-review-matcher',
      }
    })
    const largeHints={...hints,sourceVideoIds:2971,count:totalHints,entries:records}
    const largeFeed={...feed,sourceVideoIds:2971,count:totalFilms,
      entries:records.slice(0,totalFilms).map((link,i)=>({
        tmdbId:link.tmdbId,videoId:link.videoId,
        playlistClass:link.playlistMode==='free'?'FREE':'R&B',
        film:{
          type:'movie',source:'tmdb',tmdbId:link.tmdbId,
          id:'tmdb-movie-'+link.tmdbId,title:'Valid film '+i,
          description:'Canonical TMDB metadata for film '+i,
          posterUrl:'https://image.tmdb.org/t/p/w500/test.jpg',
          metadataComplete:true,
        },
      })),
    }
    await withSnapshot(async directory=>{
      const expected={feedPresent:true,newFilmTitles:325,editorialLinks:841}
      expect(await verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .toEqual(expected)
      const fetchImpl=vi.fn(async url=>({
        ok:true,json:async()=>structuredClone(String(url.pathname).includes('new-films')
          ?largeFeed:largeHints),
      }))
      expect(await verifyYoutubeEditorialFilmPublication({directory,fetchImpl}))
        .toEqual(expected)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    },{h:largeHints,f:largeFeed})
    // Cross-file video and playlist-mode integrity must remain fail-closed.
    const bad={...largeFeed,entries:largeFeed.entries.map((entry,i)=>i===324
      ?{...entry,playlistClass:entry.playlistClass==='FREE'?'R&B':'FREE'}
      :entry)}
    await withSnapshot(async directory=>{
      await expect(verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .rejects.toThrow('lacks matching exact editorial watch link')
    },{h:largeHints,f:bad})
  })

  it('accepts the centralized limit and rejects one additional film',async()=>{
    const count=YOUTUBE_NEW_FILMS_MAX_ENTRIES
    expect(count).toBe(600)
    const makeVideo=i=>'V'+String(i).padStart(10,'0')
    const records=Array.from({length:count+1},(_,i)=>({
      key:'movie:'+(300000+i),mediaType:'movie',tmdbId:300000+i,
      videoId:makeVideo(i),
      watchUrl:'https://www.youtube.com/watch?v='+makeVideo(i),
      playlistMode:'free',verificationStatus:'not-independently-verified',
      evidence:'playlist-declared-plus-review-matcher',
    }))
    const makeFeed=count=>({...feed,sourceVideoIds:3000,count,
      entries:records.slice(0,count).map((link,i)=>({
        videoId:link.videoId,tmdbId:link.tmdbId,playlistClass:'FREE',
        film:{type:'movie',source:'tmdb',tmdbId:link.tmdbId,
          id:'tmdb-movie-'+link.tmdbId,title:'Film '+i,
          description:'Complete TMDB film metadata',
          posterUrl:'https://image.tmdb.org/t/p/w500/test.jpg',
          metadataComplete:true},
      }))})
    const largeHints={...hints,sourceVideoIds:3000,count:records.length,entries:records}
    await withSnapshot(async directory=>{
      expect(await verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .toEqual({feedPresent:true,newFilmTitles:count,editorialLinks:count+1})
    },{h:largeHints,f:makeFeed(count)})
    await withSnapshot(async directory=>{
      await expect(verifyYoutubeEditorialFilmPublication({directory,prepared:true}))
        .rejects.toThrow('snapshots inconsistent')
    },{h:largeHints,f:makeFeed(count+1)})
  })
})
