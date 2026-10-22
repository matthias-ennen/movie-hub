import {describe,it,expect} from 'vitest'
import {mapVerifiedYoutubeVideoToAvailability,buildYoutubeSourceEnvelope}
  from '../src/sources/adapters/youtubeContractMapper.js'
import {
  buildYoutubeVerifiedTitleSeeds,readVerifiedYoutubeTitleSeeds,
} from '../scripts/youtube-g2-verified-title-seeds.mjs'
import {buildTitleCandidateInventory} from '../scripts/build-title-candidate-inventory.mjs'
import {buildCanonicalFanoutPlan} from '../scripts/execute-title-priority-queue.mjs'
const NOW='2026-10-22T20:05:00.000Z'
const VID='Abc12345678'
function fixture(){
  const r=mapVerifiedYoutubeVideoToAvailability({
    videoId:VID,channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',
    screening:{eligible:true},
  },{mediaType:'movie',tmdbId:539892},{
    verifiedVideoId:VID,workIdentityVerified:true,
    fullWorkOrValidCutVerified:true,dePlaybackVerified:true,
    offerTypeVerified:true,sourceUseAuthorized:true,
    accessType:'free',verifiedAt:NOW,workEvidence:'work proof',
    offerEvidence:'verified in DE',
  },{observedAt:NOW})
  return buildYoutubeSourceEnvelope([r],{generatedAt:NOW,fetchedAt:NOW})
}
describe('verified YouTube movie sources join canonical TMDB pipeline, never raw playlist guesses',()=>{
  it('projects only confirmed movie IDs, not playback URLs, user data or review guesses',()=>{
    const seed=buildYoutubeVerifiedTitleSeeds(fixture(),{now:NOW})
    expect(seed).toMatchObject({kind:'moviehub-youtube-verified-title-seeds',
      sourceId:'youtube',count:1,
      entries:[{id:'tmdb-movie-539892',tmdbId:539892,type:'movie',
        source:'youtube-curated',verifiedYoutubeTitleSeed:true}],
    })
    expect(JSON.stringify(seed)).not.toContain(VID)
    expect(JSON.stringify(seed)).not.toContain('watch?v=')
    expect(readVerifiedYoutubeTitleSeeds(seed)).toHaveLength(1)
  })
  it('surfaces an independently confirmed title as a distinct canonical source',()=>{
    const youtubeTitles=buildYoutubeVerifiedTitleSeeds(fixture(),{now:NOW})
    const inventory=buildTitleCandidateInventory({
      catalog:{titles:[{type:'movie',tmdbId:99}]},youtubeTitles,
      generatedAt:NOW,
    })
    expect(inventory.candidates.map(c=>({key:c.key,sources:c.sources}))).toEqual([
      {key:'movie:539892',sources:['youtube-curated']},
      {key:'movie:99',sources:['browse']},
    ])
    expect(inventory.sourceStats['youtube-curated']).toMatchObject({
      eligibleReferences:1,uniqueTitles:1,
    })
    expect(inventory.candidates[0].metadata.strictCompleteAvailable).toBe(false)
    expect(inventory.counts.canonicalCandidates).toBe(2)
  })
  it('reuses existing canonical enrichment + source fanout, no new film catalog',()=>{
    const youtubeTitles=buildYoutubeVerifiedTitleSeeds(fixture(),{now:NOW})
    const canonical={
      id:'tmdb-movie-539892',tmdbId:539892,type:'movie',title:'Freaks',
      originalTitle:'Freaks',description:'Movie overview',metadataComplete:true,
      providerIds:['youtube'],metadataVersion:3,
    }
    const plan=buildCanonicalFanoutPlan({
      updates:new Map([['movie:539892',canonical]]),
      catalog:{titles:[]},searchIndex:{kind:'search-index',entries:[]},
      searchShards:new Map(),youtubeTitles,generatedAt:NOW,
    })
    expect(plan.youtubeTitles.entries).toMatchObject([
      {tmdbId:539892,title:'Freaks',source:'youtube-curated',
        verifiedYoutubeTitleSeed:true},
    ])
    expect(plan.searchIndex.entries).toMatchObject([
      {tmdbId:539892,type:'movie',title:'Freaks',scope:'public'},
    ])
    expect(plan.counts).toMatchObject({
      youtubeUpdated:1,searchIndexAdded:1,firestoreWrites:0,
    })
  })
  it('refuses review guesses or malicious seed files',()=>{
    expect(readVerifiedYoutubeTitleSeeds({})).toEqual([])
    expect(()=>readVerifiedYoutubeTitleSeeds({
      kind:'moviehub-youtube-verified-title-seeds',schemaVersion:1,
      sourceId:'youtube',generatedAt:NOW,count:1,entries:[
        {id:'tmdb-movie-999',tmdbId:999,type:'movie',source:'youtube-curated',
          verifiedYoutubeTitleSeed:false},
      ],
    })).toThrow('YOUTUBE_VERIFIED_SEEDS_INVALID')
  })
});
