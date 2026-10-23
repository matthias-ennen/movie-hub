import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {describe,it,expect,vi} from 'vitest'
import {verifyYoutubeEditorialFilmPublication} from '../scripts/verify-published-data.mjs'

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
})
