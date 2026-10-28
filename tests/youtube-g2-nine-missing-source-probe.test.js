import {describe,it,expect,vi} from 'vitest'
import {recheckNineMissingVideos,TARGETS} from '../scripts/youtube-g2-nine-missing-source-probe.mjs'
import {CURATED_FREE_PLAYLIST} from '../scripts/youtube-g2-curated-source-sync.mjs'

const fixtureItem=({videoId,oldPosition},extra={})=>({
  contentDetails:{videoId},snippet:{position:oldPosition,...extra},
})
function apiFixture({detailIds=[],missing=[],move=null,privateLabel=false}={}){
  return vi.fn(async(endpoint,params)=>{
    if(endpoint==='playlistItems'){
      expect(params).toMatchObject({
        part:'snippet,contentDetails,status',playlistId:CURATED_FREE_PLAYLIST,maxResults:50,
      })
      return {items:TARGETS.filter(x=>!missing.includes(x.videoId)).map(x=>
        fixtureItem(x,x.videoId===move?{position:61}
          :privateLabel?{title:'Private video'}:{}))}
    }
    if(endpoint==='videos'){
      expect(params.part).toBe('snippet,contentDetails,status')
      expect(params.id.split(',')).toEqual(TARGETS.map(x=>x.videoId))
      return {items:detailIds.map(id=>({id,snippet:{title:'Example'}}))}
    }
    throw Error('UNEXPECTED_ENDPOINT')
  })
}
describe('G2 known nine unresolvable FREE video IDs (read-only, no publishing)',()=>{
  it('reproduces nine listed IDs with no video details without claiming why',async()=>{
    const api=apiFixture({privateLabel:true})
    const result=await recheckNineMissingVideos({youtubeApi:api,
      now:()=> '2026-10-28T07:15:00.000Z'})
    expect(result.counts).toEqual({
      'listed-but-video-details-absent':9,
      'listed-and-details-resolved':0,'no-longer-in-free-playlist':0,
    })
    expect(result.items.every(x=>x.playlistItemLabelClass==='private-placeholder')).toBe(true)
    expect(result.inferredDeletionOrPrivacy).toBe(false)
    expect(result.apiCalls).toEqual({playlistItems:1,videos:1,search:0})
    expect(result).toMatchObject({fullyScanned:true,
      publicationPermitted:false,approvedWorkIdentities:0,
      independentVerifiedDEOffers:0,catalogWrites:0,
      firestoreWrites:0,badgeWrites:0,providerWrites:0})
    expect(api.mock.calls.map(x=>x[0])).toEqual(['playlistItems','videos'])
  })
  it('distinguishes removed IDs, moved positions and newly resolvable IDs',async()=>{
    const [a,b,c]=TARGETS
    const api=apiFixture({missing:[a.videoId],detailIds:[b.videoId],
      move:c.videoId})
    const result=await recheckNineMissingVideos({youtubeApi:api})
    expect(result.counts).toEqual({
      'listed-but-video-details-absent':7,
      'listed-and-details-resolved':1,'no-longer-in-free-playlist':1,
    })
    expect(result.items[0].status).toBe('no-longer-in-free-playlist')
    expect(result.items[1].status).toBe('listed-and-details-resolved')
    expect(result.items[2]).toMatchObject({
      status:'listed-but-video-details-absent',moved:true,
      currentPlaylistPosition:61})
    expect(result.publicationPermitted).toBe(false)
  })
  it('fails closed on incomplete pagination without a video call',async()=>{
    const api=vi.fn(async(endpoint,params)=>{
      if(endpoint==='playlistItems')return {
        items:[],nextPageToken:'p'+(params.pageToken??'0'),
      }
      throw Error('MUST_NOT_REACH_VIDEO_CALL')
    })
    await expect(recheckNineMissingVideos({youtubeApi:api}))
      .rejects.toThrow('YOUTUBE_NINE_PLAYLIST_PAGINATION_LIMIT')
    expect(api.mock.calls.every(x=>x[0]==='playlistItems')).toBe(true)
    expect(api).toHaveBeenCalledTimes(3)
  })
  it('rejects unexpected API video IDs instead of silently processing them',async()=>{
    const api=apiFixture()
    api.mockImplementation(async(endpoint,params)=>{
      if(endpoint==='playlistItems')return {items:[]}
      return {items:[{id:'XXXXXXXXXXX'}]}
    })
    await expect(recheckNineMissingVideos({youtubeApi:api}))
      .rejects.toThrow('YOUTUBE_NINE_UNEXPECTED_VIDEO_RESPONSE')
  })
})
