import {describe,it,expect} from 'vitest'
import {runOriginalTmdbFirstGoldenReplay,formatTmdbFirstGoldenReplay}
  from '../scripts/youtube-g2-tmdb-first-link-pilot.mjs'
import {TMDB_FIRST_GOLDEN,compareTmdbFirstPilotToGolden}
  from '../scripts/youtube-g2-quality-golden.mjs'

const NOW='2026-10-24T10:40:00Z'
const firstId=TMDB_FIRST_GOLDEN[0].tmdbId
const index=()=>({
  kind:'search-index',version:1,source:'tmdb',country:'DE',
  generatedAt:'2026-10-24T10:20:00Z',count:150,
  entries:[{type:'movie',tmdbId:firstId,title:'Film '+firstId,year:1993,
    providerOffers:[{id:'youtube',offerTypes:['rent','buy']}]},
    ...Array.from({length:149},(_,i)=>({type:'movie',tmdbId:990000+i,
      title:'Prime '+i,year:2001,providerIds:['prime']}))],
})
const tmdbGet=async path=>{
  if(path==='/watch/providers/movie')
    return {results:[{provider_name:'YouTube',provider_id:192}]}
  if(path==='/movie/'+firstId+'/watch/providers')
    return {results:{DE:{rent:[{provider_id:192}]}}}
  if(path==='/movie/'+firstId)return {
    id:firstId,title:'Film '+firstId,original_title:'Film '+firstId,
    release_date:'1993-11-01',runtime:80,alternative_titles:{titles:[]},
    credits:{cast:[],crew:[]},external_ids:{},
  }
  throw Error('unexpected TMDB path '+path)
}
describe('25-movie historical cohort when the published TMDB YouTube badges drift',()=>{
  it('researches only still-current public YouTube badges and accounts for absent originals',async()=>{
    const called=[]
    const result=await runOriginalTmdbFirstGoldenReplay({
      publicIndex:index(),tmdbGet,
      youtubeApi:async(path,args)=>{
        called.push({path,args})
        return {items:[]}
      },
      now:()=>NOW,
      knownDeviceCandidates:[],
    })
    expect(result.rows).toHaveLength(25)
    expect(result.summary).toMatchObject({
      historicalCohortMovies:25,historicalCohortAccountedFor:25,
      selectedMovies:25,processedMovies:1,
      verifiedDirectLinks:0,publicationPermitted:false,
      catalogWrites:0,firestoreWrites:0,
    })
    expect(result.summary.historicalPublicBadgeMissingIds).toHaveLength(24)
    expect(result.summary.historicalPublicBadgeMissingIds).not.toContain(firstId)
    expect(result.summary.statusCounts['no-current-public-youtube-badge']).toBe(24)
    expect(result.rows.filter(x=>x.status==='no-current-public-youtube-badge')).toHaveLength(24)
    expect(result.rows.filter(x=>x.status==='no-current-public-youtube-badge')
      .every(x=>x.directPlaybackRoute===null&&x.videoCandidates.length===0
        &&x.priorDeviceCandidate===null&&x.publicationPermitted===false)).toBe(true)
    expect(result.summary.calls.youtubeSearches).toBe(2)
    expect(called.filter(c=>c.path==='search')).toHaveLength(2)
    const comp=compareTmdbFirstPilotToGolden(result)
    expect(comp.historicalPublicBadgesMissing).toBe(24)
    expect(comp.actualApiResearchedMovies).toBe(1)
    expect(comp.reviewDeltas.length).toBeGreaterThanOrEqual(24)
    const report=formatTmdbFirstGoldenReplay(comp,result)
    expect(report).toContain('Actual current API processed movies: 1')
    expect(report).toContain('Historic cohort missing a CURRENT PUBLIC YouTube badge: 24')
    expect(report).toContain('Independent DE offers verified: 0')
  })
  it('rejects forged missing rows or an attempt to claim missing public titles were researched',async()=>{
    const result=await runOriginalTmdbFirstGoldenReplay({
      publicIndex:index(),tmdbGet,now:()=>NOW,
      youtubeApi:async()=>({items:[]}),knownDeviceCandidates:[],
    })
    result.summary.processedMovies=25
    expect(()=>compareTmdbFirstPilotToGolden(result))
      .toThrow('YOUTUBE_G2_PILOT_REVIEW_NOT_TRUSTED')
    result.summary.processedMovies=1
    const missing=result.rows.find(x=>x.status==='no-current-public-youtube-badge')
    missing.videoCandidates=[{videoId:'Abc12345678'}]
    expect(()=>compareTmdbFirstPilotToGolden(result))
      .toThrow('YOUTUBE_G2_PILOT_MISSING_BADGE_ROW_UNTRUSTED')
  })
  it('never searches when the entire historic cohort lost its public Youtube badges',async()=>{
    const noBadge=index()
    noBadge.entries[0].providerOffers=[{id:'prime',offerTypes:['rent']}]
    noBadge.entries[1].providerIds=['youtube']
    let calls=0
    await expect(runOriginalTmdbFirstGoldenReplay({
      publicIndex:noBadge,now:()=>NOW,
      tmdbGet:async()=>{calls++;return {}},
      youtubeApi:async()=>{calls++;return {items:[]}},
    })).rejects.toThrow('G2_GOLDEN_NO_RESEARCHABLE_TMDB_IDS')
    expect(calls).toBe(0)
  })
})
