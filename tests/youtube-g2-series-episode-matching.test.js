import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {parseExplicitYoutubeEpisode,buildYoutubeEpisodeIdentityReview}
  from '../scripts/youtube-g2-series-episode-matching.mjs'
import {readCachedCanonicalSeasons,runYoutubeSeriesEpisodeReview}
  from '../scripts/youtube-g2-series-episode-review-live.mjs'
import {runCuratedTmdbMembership}
  from '../scripts/youtube-g2-curated-tmdb-membership.mjs'

const observed='2026-11-06T11:00:00.000Z'
const now='2026-11-06T12:00:00.000Z'
const pid='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const video=(id,title,minutes=22)=>({
  videoId:id,videoTitle:title,minutes,
  playlistModes:['free'],playlistIds:[pid],editorialOfferHint:'free',
  youtubeWatchUrl:'https://www.youtube.com/watch?v='+id,
  screened:false,channelId:'UCtest',deRegionSignal:'unknown',
  status:'review-screening-rejected',accepted:false,toImport:false,
  verifiedOfferType:null,playbackRoute:null,
})
const audit=candidates=>({
  mode:'CURATED_DYNAMIC_PLAYLISTS_READ_ONLY',observedAt:observed,
  publicationPermitted:false,fullyScanned:true,
  candidates,uniqueVideoIds:candidates.length,
  playlistSummaries:[{mode:'free',playlistId:pid,fullyScanned:true}],
  catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
})
const season={
  seriesTmdbId:4238,seasonNumber:2,seriesTitle:'The King of Queens',
  episodes:[
    {tmdbId:100001,episodeNumber:11,title:'Ein besonderer Tag',runtimeMinutes:22},
    {tmdbId:100002,episodeNumber:12,title:'Die Überraschung',runtimeMinutes:22},
  ],
}

describe('#13 explicitly tagged YouTube series episodes',()=>{
  it('accepts numbered SxxExx, x and German/English patterns',()=>{
    for(const title of [
      'King of Queens S02E11 Ganze Folge',
      'King of Queens S2 E11 komplette Episode',
      'King of Queens 2x11 German',
      'King of Queens Staffel 2 Folge 11',
      'King of Queens Season 2 Episode 11',
      'Episode 11 Staffel 2 – King of Queens',
    ]){
      expect(parseExplicitYoutubeEpisode(title)).toMatchObject({
        episodeLike:true,status:'candidate',seasonNumber:2,episodeNumber:11,
      })
    }
  })
  it('never treats clips, trailers, multi-episode titles or seasonless episodes as exact',()=>{
    expect(parseExplicitYoutubeEpisode('King of Queens Staffel 2 Folge 11 Trailer').status)
      .toBe('review-trailer-clip-or-review')
    expect(parseExplicitYoutubeEpisode('King of Queens S02E11 & S02E12').status)
      .toBe('review-missing-or-multiple-explicit-episode-pairs')
    expect(parseExplicitYoutubeEpisode('King of Queens S02E11-12').status)
      .toBe('review-missing-or-multiple-explicit-episode-pairs')
    expect(parseExplicitYoutubeEpisode('King of Queens Episode 11').status)
      .toBe('review-missing-or-multiple-explicit-episode-pairs')
    expect(parseExplicitYoutubeEpisode('King of Queens - Complete Series').episodeLike).toBe(false)
    expect(parseExplicitYoutubeEpisode('Die 11 besten Filme von 2001').episodeLike).toBe(false)
  })
  it('matches episode ID only for a unique, exact TV series + season + episode + plausible runtime',()=>{
    const candidates=[
      video('abcdefghijk','King of Queens Staffel 2 Folge 11'),
      video('bcdefghijkl','King of Queens S02E12',64),
      video('cdefghijklm','King of Queens S02E11 Clip'),
      video('defghijklmn','Wrong Show Staffel 2 Folge 11'),
      video('efghijklmno','King of Queens Staffel 2 Folge 13'),
      video('fghijklmnop','Unrelated full length motion picture',101),
    ]
    const result=buildYoutubeEpisodeIdentityReview(audit(candidates),[season],{now})
    expect(result.processedVideoIds).toBe(6)
    expect(result.episodeMarkedVideos).toBe(5)
    expect(result.canonicalEpisodeProposals).toBe(1)
    expect(result.cases[0]).toMatchObject({
      status:'review-exact-episode-metadata-candidate',
      canonicalEpisodeProposal:{
        mediaType:'episode',seriesTmdbId:4238,episodeTmdbId:100001,
        seasonNumber:2,episodeNumber:11,
      },playlistOfferHint:'free',
      verifiedDEOffer:false,publishedPlaybackRoute:null,approved:false,
    })
    expect(result.cases[1].status).toBe('review-runtime-disagrees-with-episode')
    expect(result.cases[2].status).toBe('review-trailer-clip-or-review')
    expect(result.cases[3].status).toBe('review-no-exact-local-tmdb-episode')
    expect(result.cases[4].status).toBe('review-no-exact-local-tmdb-episode')
    expect(result.publicationPermitted).toBe(false)
    expect(result.verifiedDEEpisodeOffers).toBe(0)
    expect(result.publishedEpisodeLinks).toBe(0)
    expect(result.firestoreWrites).toBe(0)
  })
  it('refuses ambiguous namesakes or unverifiable episode runtimes',()=>{
    const source=audit([video('abcdefghijk','King of Queens S02E11')])
    const alias={...season,seriesTmdbId:9999,episodes:[{...season.episodes[0],tmdbId:999001}]}
    expect(buildYoutubeEpisodeIdentityReview(source,[season,alias],{now}).cases[0].status)
      .toBe('review-series-or-episode-identity-collision')
    const noRuntime={...season,episodes:[{...season.episodes[0],runtimeMinutes:null}]}
    expect(buildYoutubeEpisodeIdentityReview(source,[noRuntime],{now}).cases[0].status)
      .toBe('review-canonical-runtime-unavailable')
    const blocked=audit([{...source.candidates[0],deRegionSignal:'excluded'}])
    expect(buildYoutubeEpisodeIdentityReview(blocked,[season],{now}).cases[0].status)
      .toBe('review-unavailable-region-or-runtime')
  })
  it('does not let episodic videos enter the film TMDB matcher or spend film queries',async()=>{
    const source=audit([video('abcdefghijk','King of Queens Staffel 2 Folge 11')])
    const publicIndex={
      kind:'search-index',version:1,country:'DE',source:'tmdb',
      generatedAt:observed,count:1,entries:[{type:'movie',tmdbId:123,title:'Fake Movie'}],
    }
    const tmdbGet=vi.fn(async()=>{throw Error('Must not search for film')})
    const result=await runCuratedTmdbMembership({
      audit:source,publicIndex,tmdbGet,now:()=>now,
    })
    expect(result.summary.processedRows).toBe(1)
    expect(result.summary.tmdbCalls).toBe(0)
    expect(result.rows[0]).toMatchObject({
      matchStatus:'review-episodic-video',
      topCandidates:[],verifiedTmdbId:null,
      playbackRoute:null,publicIndexMembership:'unknown',
      episodeMarker:{seasonNumber:2,episodeNumber:11},
    })
    expect(tmdbGet).not.toHaveBeenCalled()
  })
  it('loads only validated TMDB shards and keeps detailed episode QA PRIVATE',async()=>{
    const temp=await mkdtemp(join(tmpdir(),'moviehub-episode-review-'))
    try{
      const seasons=join(temp,'series')
      const input=join(temp,'playlist.json'),output=join(temp,'private')
      await mkdir(seasons)
      const shards=Array.from({length:256},(_,i)=>({
        bucket:i.toString(16).padStart(2,'0'),count:i===0?1:0,
      }))
      await writeFile(join(seasons,'manifest.json'),JSON.stringify({
        kind:'series-season-manifest',version:1,shards,
      }))
      await writeFile(join(seasons,'00.json'),JSON.stringify({
        kind:'series-season-shard',version:1,bucket:'00',entries:[season],
      }))
      await writeFile(input,JSON.stringify({audit:audit([video(
        'abcdefghijk','King of Queens Staffel 2 Folge 11',
      )])}))
      const canonical=await readCachedCanonicalSeasons(seasons)
      expect(canonical).toHaveLength(1)
      const report=await runYoutubeSeriesEpisodeReview({
        input,seasonDirectory:seasons,output,now,
      })
      expect(report.canonicalEpisodeProposals).toBe(1)
      expect(report.publishedEpisodeLinks).toBe(0)
    }finally{await rm(temp,{recursive:true,force:true})}
  })
})
