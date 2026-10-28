import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe,it,expect,vi} from 'vitest'
import {YOUTUBE_SEARCH_PUBLIC_PATHS,verifyYoutubeSearchCompanionPublication}
  from '../scripts/verify-youtube-search-companion-publication.mjs'

const AT='2026-10-28T08:30:00.000Z'
const NOW=Date.parse('2026-10-28T08:32:00.000Z')
const VIDEO='xlRAr36rWo0'
const ID=12594
const film={type:'movie',source:'tmdb',tmdbId:ID,id:'tmdb-movie-'+ID,
  title:'Film 12594',description:'Canonical test film metadata.',
  posterUrl:'https://image.tmdb.org/t/p/w500/example.jpg',
  metadataComplete:true,providerIds:['youtube']}
const hints=()=>({
  kind:'moviehub-youtube-curated-editorial-title-hints',schemaVersion:1,
  providerId:'youtube',publicationAuthority:'editorial-playlist-only',
  generatedAt:AT,sourceVideoIds:2,verifiedDEOffers:0,verifiedPlaybackRoutes:0,
  count:1,entries:[{
    key:'movie:'+ID,mediaType:'movie',tmdbId:ID,videoId:VIDEO,
    watchUrl:'https://www.youtube.com/watch?v='+VIDEO,
    playlistMode:'free',verificationStatus:'not-independently-verified',
  }],
})
const films=()=>({
  kind:'moviehub-youtube-curated-new-film-metadata',
  schemaVersion:1,providerId:'youtube',generatedAt:AT,
  sourceVideoIds:2,offerVerification:'editorial-only-not-independent',
  count:1,entries:[{tmdbId:ID,videoId:VIDEO,playlistClass:'FREE',film}],
})
const search=()=>({
  kind:'moviehub-youtube-curated-search-title-metadata',
  schemaVersion:1,providerId:'youtube',
  sourceType:'user-curated-playlists-with-tmdb-metadata',
  offerVerification:'editorial-only-not-independent',
  generatedAt:AT,sourceVideoIds:2,count:1,
  entries:[{tmdbId:ID,film}],
})
const triplet=()=>[hints(),films(),search()]
async function withFiles(action,files=triplet()){
  const dir=await mkdtemp(join(tmpdir(),'youtube-search-hosting-'))
  try {
    for(let i=0;i<files.length;i++)
      if(files[i])await writeFile(join(dir,YOUTUBE_SEARCH_PUBLIC_PATHS[i]),
        JSON.stringify(files[i]))
    return await action(dir)
  } finally {await rm(dir,{recursive:true,force:true})}
}
function requestFor(files=triplet(),{cache='public, no-store',json=true}={}){
  return vi.fn(async uri=>{
    const index=YOUTUBE_SEARCH_PUBLIC_PATHS.findIndex(x=>uri.pathname==='/'+x)
    return {ok:true,status:200,
      headers:{get:k=>k==='cache-control'?cache
        :k==='content-type'?(json?'application/json; charset=utf-8':'text/html'):null},
      json:async()=>structuredClone(files[index]),
    }
  })
}
describe('YouTube canonical search companion is current, complete and revocable',()=>{
  it('verifies all three exact newly published JSON files and real no-store headers',async()=>{
    await withFiles(async directory=>{
      const request=requestFor()
      expect(await verifyYoutubeSearchCompanionPublication({directory,request,now:NOW}))
        .toEqual({published:true,count:1,revoked:false})
      expect(request).toHaveBeenCalledTimes(3)
      const actual=request.mock.calls.map(([u,options])=>({
        pathname:u.pathname,cache:options.cache,redirect:options.redirect,
      }))
      expect(actual.map(x=>x.pathname))
        .toEqual(YOUTUBE_SEARCH_PUBLIC_PATHS.map(x=>'/'+x))
      expect(actual.every(x=>x.cache==='no-store'&&x.redirect==='error')).toBe(true)
      expect(await verifyYoutubeSearchCompanionPublication({
        directory,request,now:NOW,prepared:true,
      })).toEqual({published:true,count:1,revoked:false})
      expect(request).toHaveBeenCalledTimes(3)
    })
  })
  it('refuses mixed/missing source generations and incomplete companion coverage',async()=>{
    const cases=[
      [hints(),films(),null],
      [hints(),null,search()],
      [hints(),films(),{...search(),generatedAt:'2026-10-27T08:30:00Z'}],
      [hints(),films(),{...search(),count:0,entries:[]}],
      [hints(),films(),{...search(),entries:[{tmdbId:22,film:{...film,tmdbId:22,id:'tmdb-movie-22'}}]}],
      [hints(),films(),{...search(),entries:[{tmdbId:ID,film:{...film,personal:true}}]}],
      [{...hints(),entries:[{...hints().entries[0],watchUrl:'https://evil.test'}]},films(),search()],
    ]
    for(const files of cases)await withFiles(async directory=>{
      await expect(verifyYoutubeSearchCompanionPublication({
        directory,prepared:true,now:NOW,
      })).rejects.toThrow()
    },files)
  })
  it('rejects stale HTTP data, cached responses and HTML rewrites',async()=>{
    await withFiles(async directory=>{
      await expect(verifyYoutubeSearchCompanionPublication({
        directory,request:requestFor(triplet(),{cache:'public, max-age=3600'}),now:NOW,
      })).rejects.toThrow('HOSTING_RESPONSE_INVALID')
      await expect(verifyYoutubeSearchCompanionPublication({
        directory,request:requestFor(triplet(),{json:false}),now:NOW,
      })).rejects.toThrow('HOSTING_RESPONSE_INVALID')
      const old=triplet()
      old[2]={...old[2],count:0,entries:[]}
      await expect(verifyYoutubeSearchCompanionPublication({
        directory,request:requestFor(old),now:NOW,
      })).rejects.toThrow('Published generation differs from build: youtube-curated-search-titles.json')
    })
  })
  it('treats fully absent local publication as safe only after remote JSON is truly revoked',async()=>{
    await withFiles(async directory=>{
      const html=vi.fn(async()=>({
        ok:true,status:200,headers:{get:()=> 'text/html'},
      }))
      expect(await verifyYoutubeSearchCompanionPublication({directory,request:html,now:NOW}))
        .toEqual({published:false,count:0,revoked:true})
      await expect(verifyYoutubeSearchCompanionPublication({
        directory,request:requestFor(),now:NOW,
      })).rejects.toThrow('STALE_PUBLIC_FILE_NOT_REVOKED')
    },[null,null,null])
  })
})
