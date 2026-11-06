import {describe,it,expect,vi} from 'vitest'
import {runTwoCuratedPlaylistAudit,classForPlaylistMode,modeForPlaylistClass}
  from '../scripts/youtube-g2-curated-two-playlists.mjs'
import {validateCuratedSyncAudit} from '../scripts/youtube-g2-curated-source-sync.mjs'
const ids=['PL11111111111111111111111111111111','PL22222222222222222222222222222222',
  'PL33333333333333333333333333333333','PL44444444444444444444444444444444']
const vids=['Abc12345678','Zbc12345678','Cbc12345678']
const sources=[
 {playlistId:ids[0],mode:'free',name:'Free Filme'},
 {playlistId:ids[1],mode:'rent-buy',name:'Leihen und Kaufen'},
 {playlistId:ids[2],mode:'flatrate',name:'Serien'},
 {playlistId:ids[3],mode:'free',name:'Mehr Free Filme'},
]
function mockApi(){
  return vi.fn(async(endpoint,args)=>{
    if(endpoint==='playlists')return {items:args.id.split(',').map(id=>({
      id,snippet:{channelId:'UC222'},status:{privacyStatus:'public'},
    }))}
    if(endpoint==='playlistItems')return {items:
      (args.playlistId===ids[0]?[vids[0],vids[1]]:
        args.playlistId===ids[1]?[vids[1]]:
        args.playlistId===ids[2]?[vids[2]]:[vids[0]])
        .map((videoId,position)=>({contentDetails:{videoId},snippet:{position}}))}
    if(endpoint==='videos')return {items:args.id.split(',').map(id=>({
      id,snippet:{channelId:'UC222',title:'Feature Movie (1997)',categoryId:'30'},
      contentDetails:{duration:'PT1H44M',regionRestriction:{allowed:['DE']}},
      status:{privacyStatus:'public'},
    }))}
    throw Error('unexpected endpoint '+endpoint)
  })
}
describe('dynamic MovieHub Admin playlists are exclusive source',()=>{
  it('reads every enabled playlist, deduplicates by video ID, keeps all source IDs',async()=>{
    const api=mockApi()
    const audit=await runTwoCuratedPlaylistAudit({sources,youtubeApi:api,at:()=> '2026-11-06T11:00:00Z'})
    expect(audit.mode).toBe('CURATED_DYNAMIC_PLAYLISTS_READ_ONLY')
    expect(audit.fullyScanned).toBe(true)
    expect(audit.playlistSummaries).toHaveLength(4)
    expect(audit.uniqueVideoIds).toBe(3)
    expect(audit.calls).toMatchObject({playlists:1,playlistItems:4,videos:1,search:0,tmdb:0})
    expect(audit.candidates.find(x=>x.videoId===vids[0])).toMatchObject({
      playlistModes:['free'],playlistIds:[ids[0],ids[3]],editorialOfferHint:'free',
    })
    expect(audit.candidates.find(x=>x.videoId===vids[1])).toMatchObject({
      playlistModes:['free','rent-buy'],playlistIds:[ids[0],ids[1]],editorialOfferHint:'free',
    })
    expect(audit.candidates.find(x=>x.videoId===vids[2]).editorialOfferHint).toBe('flatrate')
    expect(validateCuratedSyncAudit(audit,{now:'2026-11-06T12:00:00Z'})).toBe(audit)
    expect(api.mock.calls.map(x=>x[0])).toEqual(['playlists','playlistItems','playlistItems','playlistItems','playlistItems','videos'])
  })
  it('supports six canonical labels without mixing sources',()=>{
    for(const [mode,klass] of Object.entries({free:'FREE',ads:'ADS',flatrate:'FLAT',
      rent:'RENT',buy:'BUY','rent-buy':'R&B'})){
      expect(classForPlaylistMode(mode)).toBe(klass)
      expect(modeForPlaylistClass(klass)).toBe(mode)
    }
  })
  it('rejects duplicate IDs and truncated scans, never silently uses old fixed playlists',async()=>{
    await expect(runTwoCuratedPlaylistAudit({sources:[sources[0],sources[0]],youtubeApi:mockApi()}))
      .rejects.toThrow('INVALID_OR_DUPLICATE')
    await expect(runTwoCuratedPlaylistAudit({sources:[],youtubeApi:mockApi()}))
      .rejects.toThrow('NO_ENABLED')
    const api=vi.fn(async(endpoint,args)=>{
      if(endpoint==='playlists')return {items:[{id:ids[0],snippet:{channelId:'UC1'},status:{privacyStatus:'public'}}]}
      if(endpoint==='playlistItems')return {items:[],nextPageToken:'always'}
      if(endpoint==='videos')return {items:[]}
    })
    const a=await runTwoCuratedPlaylistAudit({sources:[sources[0]],youtubeApi:api})
    expect(a.fullyScanned).toBe(false)
    expect(()=>validateCuratedSyncAudit(a)).toThrow()
  })
})
