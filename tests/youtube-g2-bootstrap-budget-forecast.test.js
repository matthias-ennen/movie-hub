import {describe,it,expect} from 'vitest'
import {
 createYoutubeBootstrapBudgetForecast,bootstrapBudgetMarkdown,
} from '../scripts/youtube-g2-bootstrap-budget-forecast.mjs'
const NOW='2026-10-25T09:00:00.000Z'
const movie=(id,youtube)=>({
  type:'movie',tmdbId:id,title:'Film '+id,
  providerIds:youtube?['youtube']:['other'],providerOffers:[],
})
const index=()=>({
  kind:'search-index',version:1,country:'DE',source:'published',
  generatedAt:'2026-10-25T08:00:00Z',
  count:7,entries:[
    movie(11,true),movie(20,true),movie(21,true),movie(22,true),
    movie(25,false),movie(11,true),{type:'series',tmdbId:33,providerIds:['youtube']},
  ],
})
const checkpoint=()=>({
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-24T09:00:00Z',
  updatedAt:'2026-10-24T17:00:00Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[
    {tmdbId:11,videoIds:['Abc12345678'],
      provenance:[{kind:'successful-readonly-full-catalog-batch',runId:40000000001}]},
    {tmdbId:999,videoIds:['Def12345678'],
      provenance:[{kind:'published-editorial-playlist-hint',runId:40108251915}]},
  ],
})
const inputs=()=>({publicIndex:index(),globalCheckpoint:checkpoint(),now:NOW})
describe('MovieHub read-only YouTube bootstrap search forecast',()=>{
  it('uses unique public movie badges and authenticated global cache overlap, not user profiles',()=>{
    const p=createYoutubeBootstrapBudgetForecast(inputs())
    expect(p).toMatchObject({
      publicBadgeMovieCount:4,checkpointStoredCandidateMovieCount:2,
      knownCandidateOverlapInPublicBadges:1,
      storedCandidatesOutsidePublicBadges:1,
      publicBadgeFilmsWithoutCachedCandidates:3,
      configuredProjectSearchListDailyLimit:100,
      plannedDailyResearchSearchCalls:10,
      plannedFilmsForSingleResearchEnvelope:3,
      theoreticalSearchCallsForSingleEnvelope:6,
      currentQuotaRemaining:null,currentActualQuotaUsage:null,
      availableSearchCallsGuaranteed:false,automaticallyRunSearch:false,
      newYoutubeSearchCalls:0,verifiedGermanOffers:0,
      confirmedPlaybackRoutes:0,publicationPermitted:false,
      privateArtifact:true,firestoreWrites:0,providerWrites:0,
    })
    expect(p.selectedResearchHypotheses.map(x=>x.key))
      .toEqual(['movie:20','movie:21','movie:22'])
    expect(p.scenarios.map(s=>s.minimumTheoreticalSearchDays))
      .toEqual([1,1,1,1])
    expect(bootstrapBudgetMarkdown(p)).toContain('Filme OHNE bisher gespeicherten Video-Kandidaten: 3')
    expect(bootstrapBudgetMarkdown(p)).toContain('Keine Suchfreigabe')
  })
  it('computes daily time as pure search time and never assumes guaranteed quota',()=>{
    const p=createYoutubeBootstrapBudgetForecast({...inputs(),dailyResearchSearchCalls:2})
    expect(p.plannedFilmsForSingleResearchEnvelope).toBe(1)
    expect(p.selectedResearchHypotheses).toEqual([{key:'movie:20',tmdbId:20}])
    expect(p.scenarios).toEqual([
      {researchSearchCallsPerDay:10,reservedForOtherSearchWorkflows:90,
        candidateFilmsPerDay:5,minimumTheoreticalSearchDays:1},
      {researchSearchCallsPerDay:20,reservedForOtherSearchWorkflows:80,
        candidateFilmsPerDay:10,minimumTheoreticalSearchDays:1},
      {researchSearchCallsPerDay:40,reservedForOtherSearchWorkflows:60,
        candidateFilmsPerDay:20,minimumTheoreticalSearchDays:1},
      {researchSearchCallsPerDay:80,reservedForOtherSearchWorkflows:20,
        candidateFilmsPerDay:40,minimumTheoreticalSearchDays:1},
    ])
    expect(p.automaticallyRunSearch).toBe(false)
  })
  it('never adds other providers, series, duplicate film IDs or unsupported unpublished hints',()=>{
    const x=inputs()
    x.publicIndex.entries[2].providerIds=['google_tv']
    x.publicIndex.entries[2].providerOffers=[{id:'youtube',offerTypes:['rent']}]
    const p=createYoutubeBootstrapBudgetForecast(x)
    expect(p.publicBadgeMovieCount).toBe(4)
    x.publicIndex.entries[2].providerOffers=[]
    expect(createYoutubeBootstrapBudgetForecast(x).publicBadgeMovieCount).toBe(3)
  })
  it('fails closed on stale index, counterfeit cache and invalid budget',()=>{
    const mutants=[
      x=>{x.publicIndex.count=10},
      x=>{x.publicIndex.country='US'},
      x=>{x.publicIndex.source='fallback'},
      x=>{x.publicIndex.generatedAt='2026-07-01T00:00:00Z'},
      x=>{x.globalCheckpoint.verifiedDEOffers=1},
      x=>{x.globalCheckpoint.entries[0].videoIds=['bad']},
      x=>{x.globalCheckpoint.entries[1].tmdbId=11},
      x=>{x.publicIndex.entries[0].tmdbId=-2},
    ]
    for(const mutate of mutants){
      const input=inputs();mutate(input)
      expect(()=>createYoutubeBootstrapBudgetForecast(input)).toThrow()
    }
    for(const budget of [0,1,3,21,100,NaN]){
      expect(()=>createYoutubeBootstrapBudgetForecast({
        ...inputs(),dailyResearchSearchCalls:budget,
      })).toThrow('YOUTUBE_BOOTSTRAP_RESEARCH_ENVELOPE_INVALID')
    }
  })
  it('refuses any fabricated German offer, playback route or automatic search permission',()=>{
    const p=createYoutubeBootstrapBudgetForecast(inputs())
    for(const mutate of [
      x=>{x.verifiedGermanOffers=1},
      x=>{x.confirmedPlaybackRoutes=1},
      x=>{x.automaticallyRunSearch=true},
      x=>{x.availableSearchCallsGuaranteed=true},
      x=>{x.currentQuotaRemaining=100},
      x=>{x.firestoreWrites=1},
      x=>{x.publicationPermitted=true},
    ]){
      const forged=structuredClone(p);mutate(forged)
      expect(()=>bootstrapBudgetMarkdown(forged)).toThrow()
    }
  })
})
