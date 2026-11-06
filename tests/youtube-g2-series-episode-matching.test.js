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


describe('#13 title-only episodes in the third MovieHub Admin playlist', () => {
  const third='PLUGwm4p6v-gI'
  const titleOnly=(id,title,minutes=21.1)=>({
    ...video(id,title,minutes),playlistIds:[third],playlistModes:['rent-buy'],
    editorialOfferHint:'rent-buy',
  })
  const twoHalfMen={
    seriesTmdbId:2691,seasonNumber:1,seriesTitle:'Two and a Half Men',
    episodes:[
      {tmdbId:900001,episodeNumber:1,title:'Stur, zwanghaft und unflexibel',runtimeMinutes:22},
      {tmdbId:900010,episodeNumber:10,title:'Der Truthahn und die Männlichkeit',runtimeMinutes:21},
      {tmdbId:900013,episodeNumber:13,title:'Penny und die Physiker',runtimeMinutes:22},
    ],
  }
  it('matches only exact, unique episode titles and plausible full-episode runtime',()=>{
    const titles=[
      titleOnly('abcdefghijk','Stur, zwanghaft und unflexibel',22.8),
      titleOnly('bcdefghijkl','Der Truthahn und die Männlichkeit',21),
      titleOnly('cdefghijklm','Penny und die Physiker',21.5),
      titleOnly('defghijklmn','Dissimilar full-length feature',91),
    ]
    expect(parseExplicitYoutubeEpisode(titles[0].videoTitle).episodeLike).toBe(false)
    const report=buildYoutubeEpisodeIdentityReview(audit(titles),[twoHalfMen],{now})
    expect(report.episodeMarkedVideos).toBe(0)
    expect(report.episodeTitleOnlyCandidates).toBe(3)
    expect(report.episodeIdentityReviewCases).toBe(3)
    expect(report.canonicalEpisodeProposals).toBe(3)
    expect(report.cases.map(x=>x.canonicalEpisodeProposal?.episodeTmdbId))
      .toEqual([900001,900010,900013])
    expect(report.cases.every(x=>x.identityEvidence==='exact-unique-canonical-episode-title'
      &&x.status==='review-exact-episode-metadata-candidate'
      &&x.approved===false&&x.publishedPlaybackRoute===null)).toBe(true)
    expect(report.publishedEpisodeLinks).toBe(0)
  })
  it('rejects ambiguous titles, clips and implausible runtimes without guessing a series',()=>{
    const collision={...twoHalfMen,seriesTmdbId:9999,seriesTitle:'Different Sitcom',
      episodes:[{tmdbId:990010,episodeNumber:3,title:'Stur, zwanghaft und unflexibel',runtimeMinutes:22}]}
    const items=[
      titleOnly('abcdefghijk','Stur, zwanghaft und unflexibel',22),
      titleOnly('bcdefghijkl','Der Truthahn und die Männlichkeit',60),
      titleOnly('cdefghijklm','Penny und die Physiker Trailer',21),
      titleOnly('defghijklmn','Die Show',20),
    ]
    const report=buildYoutubeEpisodeIdentityReview(audit(items),[twoHalfMen,collision],{now})
    expect(report.episodeIdentityReviewCases).toBe(1)
    expect(report.cases[0]).toMatchObject({
      status:'review-episode-title-collision',identityEvidence:'exact-unique-canonical-episode-title',
      canonicalEpisodeProposal:null,
    })
    expect(report.publishedEpisodeLinks).toBe(0)
  })
  it('matches localized title aliases but does not accept generic titles',()=>{
    const local={...twoHalfMen,episodes:[
      {tmdbId:900090,episodeNumber:9,title:'A Different Tie',
        titleAliases:['Die andere Seite der Krawatte'],runtimeMinutes:20},
      {tmdbId:900091,episodeNumber:10,title:'Pilot',runtimeMinutes:20},
    ]}
    const source=audit([titleOnly('abcdefghijk','Die andere Seite der Krawatte',20.1),
      titleOnly('bcdefghijkl','Pilot',20)])
    const result=buildYoutubeEpisodeIdentityReview(source,[local],{now})
    expect(result.episodeTitleOnlyCandidates).toBe(1)
    expect(result.cases[0].canonicalEpisodeProposal).toMatchObject({
      mediaType:'episode',episodeTmdbId:900090,seasonNumber:1,episodeNumber:9,
    })
  })
})


describe('#13 film pipeline consumes the private episode review from the same nightly scan',()=>{
  it('never searches for a movie whose standalone title matches a unique episode',async()=>{
    const episode={seriesTmdbId:2691,seasonNumber:1,seriesTitle:'Two and a Half Men',episodes:[
      {tmdbId:90112,episodeNumber:1,title:'Stur, zwanghaft und unflexibel',runtimeMinutes:22},
    ]}
    const source=audit([video('abcdefghijk','Stur, zwanghaft und unflexibel',22)])
    const review=buildYoutubeEpisodeIdentityReview(source,[episode],{now})
    expect(review.canonicalEpisodeProposals).toBe(1)
    const index={kind:'search-index',version:1,country:'DE',source:'tmdb',
      generatedAt:observed,count:1,entries:[{type:'movie',tmdbId:9999,title:'Similar name'}]}
    const tmdbGet=vi.fn(async()=>{throw Error('Episode title must not search movies')})
    const result=await runCuratedTmdbMembership({
      audit:source,publicIndex:index,episodeReview:review,tmdbGet,now:()=>now,
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({matchStatus:'review-episodic-video',
      topCandidates:[],episodeMarker:{seasonNumber:1,episodeNumber:1},
      verifiedTmdbId:null,toImport:false,playbackRoute:null})
    expect(result.summary.tmdbCalls).toBe(0)
    expect(tmdbGet).not.toHaveBeenCalled()
  })
  it('fails closed if episode review is stale, incomplete or belongs to a different source',async()=>{
    const ep={seriesTmdbId:2691,seasonNumber:1,seriesTitle:'Two and a Half Men',episodes:[
      {tmdbId:90112,episodeNumber:1,title:'Stur, zwanghaft und unflexibel',runtimeMinutes:22},
    ]}
    const source=audit([video('abcdefghijk','Stur, zwanghaft und unflexibel',22)])
    const review=buildYoutubeEpisodeIdentityReview(source,[ep],{now})
    const index={kind:'search-index',version:1,country:'DE',source:'tmdb',
      generatedAt:observed,count:1,entries:[{type:'movie',tmdbId:100,title:'Movie'}]}
    const tmdbGet=vi.fn()
    for(const bad of [
      {...review,sourceQAObservedAt:'2026-11-05T11:00:00Z'},
      {...review,episodeIdentityReviewCases:0},
      {...review,cases:[{...review.cases[0],videoId:'XXXXXXXXXXX'}]},
      {...review,verifiedDEEpisodeOffers:1},
      {...review,cases:[{...review.cases[0],approved:true}]},
    ]){
      await expect(runCuratedTmdbMembership({
        audit:source,publicIndex:index,episodeReview:bad,tmdbGet,now:()=>now,
      })).rejects.toThrow('CURATED_EPISODE_REVIEW_MISSING_OR_INVALID')
    }
    expect(tmdbGet).not.toHaveBeenCalled()
  })
})
