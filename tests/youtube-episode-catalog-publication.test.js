import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {buildYoutubeEpisodeIdentityReview} from '../scripts/youtube-g2-series-episode-matching.mjs'
import {publishYoutubeEpisodePlaylistHints,projectYoutubeEpisodePlaylistHints}
  from '../scripts/publish-youtube-episode-catalog-live.mjs'
import {verifyYoutubeEpisodeCatalogPublication}
  from '../scripts/verify-youtube-episode-catalog-publication.mjs'
import {selectYoutubeEpisodePlaylistRoute}
  from '../src/providers/youtubeEpisodePlaylistRoute.js'
import {normalizeSeasonEpisode} from '../src/catalog/seriesNavigation.js'

const now='2026-11-06T16:05:00.000Z'
const season={
  seriesTmdbId:512,seasonNumber:1,seriesTitle:'Two and a Half Men',
  episodes:[{tmdbId:900100,episodeNumber:1,
    title:'Stur, zwanghaft und unflexibel',runtimeMinutes:22}],
}
const raw={videoId:'abcdefghijk',videoTitle:'Stur, zwanghaft und unflexibel',
  minutes:22,playlistIds:['PLUGwm4p6v-gI'],playlistModes:['rent-buy'],
  editorialOfferHint:'rent-buy',youtubeWatchUrl:'https://www.youtube.com/watch?v=abcdefghijk',
  status:'review-tmdb-work-identity',screened:true,deRegionSignal:'allowed',
  accepted:false,toImport:false,verifiedOfferType:null,playbackRoute:null}
function review(candidates=[raw]){
  const audit={mode:'CURATED_DYNAMIC_PLAYLISTS_READ_ONLY',
    observedAt:now,publicationPermitted:false,fullyScanned:true,
    uniqueVideoIds:candidates.length,candidates,
    playlistSummaries:[{mode:'rent-buy',playlistId:'PLUGwm4p6v-gI',fullyScanned:true}],
    firestoreWrites:0,catalogWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0}
  return buildYoutubeEpisodeIdentityReview(audit,[season],{now})
}
async function fixture(callback){
  const dir=await mkdtemp(join(tmpdir(),'moviehub-episode-catalog-'))
  const shards=join(dir,'series-details')
  await mkdir(shards)
  const manifest={kind:'series-season-manifest',version:1,bucketCount:256,
    shards:Array.from({length:256},(_,i)=>({
      bucket:i.toString(16).padStart(2,'0'),count:i===0?1:0,
    }))}
  const payload={kind:'series-season-shard',version:1,bucket:'00',entries:[season]}
  const file=join(dir,'private.json'),summary=join(dir,'youtube-episode-playlist-summary.json')
  await writeFile(join(shards,'manifest.json'),JSON.stringify(manifest))
  await writeFile(join(shards,'00.json'),JSON.stringify(payload))
  await writeFile(file,JSON.stringify(review()))
  try{await callback({dir,shards,file,summary})}
  finally{await rm(dir,{recursive:true,force:true})}
}
const read=path=>readFile(path,'utf8').then(JSON.parse)
describe('#13 canonical, episode-only YouTube playlist enrichment',()=>{
  it('puts exact video ID only on the matching canonical TMDB episode',async()=>{
    await fixture(async({dir,shards,file,summary})=>{
      const result=await publishYoutubeEpisodePlaylistHints({
        reviewPath:file,shardDirectory:shards,summaryPath:summary,now,
      })
      expect(result).toMatchObject({
        provisionalEpisodeLinks:1,independentlyVerifiedDEOffers:0,verifiedPlaybackRoutes:0,
        affectedBuckets:['00']})
      const [payload,manifest]=await Promise.all([
        read(join(shards,'00.json')),read(join(shards,'manifest.json')),
      ])
      const hint=payload.entries[0].episodes[0].youtubePlaylistHint
      expect(hint).toMatchObject({
        kind:'moviehub-youtube-editorial-episode-hint',
        seriesTmdbId:512,seasonNumber:1,episodeNumber:1,episodeTmdbId:900100,
        playlistMode:'rent-buy',videoId:'abcdefghijk',
        verificationStatus:'not-independently-verified'})
      expect(manifest.youtubeEpisodePlaylistEnrichment.provisionalEpisodeLinks).toBe(1)
      const episode=normalizeSeasonEpisode(payload.entries[0].episodes[0],{
        seriesTmdbId:512,seriesTitle:'Two and a Half Men',seasonNumber:1,
      })
      const route=selectYoutubeEpisodePlaylistRoute(episode.youtubePlaylistHint,episode,{
        now:Date.parse(now)+1000})
      expect(route).toMatchObject({
        target:'https://www.youtube.com/watch?v=abcdefghijk',
        scope:'title',episodeScoped:true,playlistMode:'rent-buy'})
      expect(selectYoutubeEpisodePlaylistRoute(hint,{...episode,tmdbId:900099},{
        now:Date.parse(now)+1000})).toBeNull()
      expect(selectYoutubeEpisodePlaylistRoute(hint,{...episode,seasonNumber:2},{
        now:Date.parse(now)+1000})).toBeNull()
      expect(selectYoutubeEpisodePlaylistRoute(hint,episode,{
        now:Date.parse(hint.expiresAt)+1000})).toBeNull()
      const fetch=vi.fn(async url=>({ok:true,json:()=>read(join(dir,url.pathname.replace(/^\//,'')))}))
      await expect(verifyYoutubeEpisodeCatalogPublication({
        publicDir:dir,request:fetch,prepared:false,
      })).resolves.toMatchObject({provisionalEpisodeLinks:1})
      expect(fetch).toHaveBeenCalledTimes(3)
    })
  })
  it('removes all old shortcuts when playlist title disappears; never leaves stale links',async()=>{
    await fixture(async({shards,file,summary})=>{
      await publishYoutubeEpisodePlaylistHints({
        reviewPath:file,shardDirectory:shards,summaryPath:summary,now,
      })
      const missing={...review(),cases:[],episodeMarkedVideos:0,
        episodeTitleOnlyCandidates:0,episodeIdentityReviewCases:0,
        canonicalEpisodeProposals:0,reviewStatusCounts:{}}
      await writeFile(file,JSON.stringify(missing))
      const result=await publishYoutubeEpisodePlaylistHints({
        reviewPath:file,shardDirectory:shards,summaryPath:summary,
        now:'2026-11-06T16:15:00.000Z',
      })
      expect(result.provisionalEpisodeLinks).toBe(0)
      expect((await read(join(shards,'00.json'))).entries[0].episodes[0])
        .not.toHaveProperty('youtubePlaylistHint')
    })
  })
  it('blocks duplicate videos for one episode instead of choosing an arbitrary winner',()=>{
    const r=review()
    const two={...r,cases:[...r.cases,{...r.cases[0],videoId:'bcdefghijkl'}],
      episodeIdentityReviewCases:2,canonicalEpisodeProposals:2}
    const out=projectYoutubeEpisodePlaylistHints(two,{now})
    expect(out.byKey.size).toBe(0)
    expect(out.collisions).toBe(1)
  })
  it('rejects expired, forged approved or inconsistent source evidence',()=>{
    const r=review()
    for(const bad of [
      {...r,privateArtifact:false},
      {...r,publishedEpisodeLinks:1},
      {...r,cases:[{...r.cases[0],approved:true}]},
      {...r,canonicalEpisodeProposals:0},
    ])expect(()=>projectYoutubeEpisodePlaylistHints(bad,{now}))
      .toThrow()
  })
})
