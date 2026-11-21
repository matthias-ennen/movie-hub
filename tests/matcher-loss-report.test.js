import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { waipuLoss, joynLoss, xmltvLoss, youtubeLoss, writeMatcherLossReport } from '../scripts/matcher-loss-report.mjs'
import { buildNightlyReport, nightlyMarkdown } from '../scripts/moviehub-nightly-chain-report.mjs'
import { XMLTV_REVIEWED_STATIONS } from '../src/sources/xmltv/xmltvStationMappings.js'

const waipu = {
  kind:'waipu-matcher-loss-input', totalPrograms:107, matchedPrograms:1,
  classificationLosses:[{programId:'excluded',title:'Sport',reason:'unsupported_grid_genre',stage:'grid-classification'}],
  unresolvedPrograms:Array.from({length:105},(_,i)=>({programId:'p'+i,title:'Film '+i,reason:'below_threshold',
    productionYear:2001, cache:'hit',diagnostic:{best:{tmdbId:i+1,title:'Candidate '+i,score:99,debugSecret:'secret'},margin:1}})),
}
const joyn = {kind:'joyn-matcher-loss-input',totalPrograms:4,processedPrograms:2,matchedPrograms:1,
  entries:[{joynProgramId:'j',title:'Example',description:'never export this',fromCache:true,
    joynClassification:{reason:'budget_exhausted',type:null,apiKey:'secret'},
    decision:{reason:'tmdb_search_skipped_budget',status:'unmatched',diagnosticCandidates:{best:{tmdbId:13,score:70}}}}]}
const stations=Object.fromEntries(XMLTV_REVIEWED_STATIONS.map(s=>[s.stationId,
  {selected:1,accepted:0,unclassified:1,noCandidates:0,nonexact:0,yearConflict:0,other:0,originalTitle:'private title'}]))
const xml = {kind:'xmltv-matcher-loss-counts',validatedSources:1,selected:Object.keys(stations).length,matched:0,stations}
const research = {summary:{mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',sourceVideoIds:3},rows:[
  {videoId:'one',videoTitle:'Linked',matchStatus:'review-leading-film-hypothesis',topCandidates:[]},
  {videoId:'two',videoTitle:'Ambiguous',matchStatus:'review-multiple-film-works',topCandidates:[{tmdbId:10,title:'Film A',score:38}]},
  {videoId:'three',videoTitle:'Episode',matchStatus:'review-episodic-video',episodeMarker:{seasonNumber:1,episodeNumber:3},topCandidates:[]},
]}
const queue = {kind:'moviehub-youtube-g2-actionable-review-queue',sourceVideoIds:3,items:[
  {videoId:'one',publicationStatus:'playlist-link-published'},
  {videoId:'two',publicationStatus:'review-only',lane:'ambiguous-work-identity'},
  {videoId:'three',publicationStatus:'review-only',lane:'series-episode-identity-review'},
]}

describe('Nightly matcher loss reports',()=>{
  it('keeps all 106 non-matches, separates exclusion and preserves native scores',()=>{
    const r=waipuLoss(waipu,'success')
    expect(r.status).toBe('complete')
    expect(r.lossCount).toBe(106)
    expect(r.rows).toHaveLength(106)
    expect(r.byCategory).toEqual({excluded:1,unresolved:105})
    expect(r.rows[1].candidates[0]).toMatchObject({score:99,title:'Candidate 0'})
    expect(JSON.stringify(r)).not.toContain('debugSecret')
  })
  it('reports partial Joyn decisions honestly and omits raw descriptions and auth data',()=>{
    const r=joynLoss(joyn,'failure')
    expect(r).toMatchObject({status:'partial',unprocessed:2,lossCount:1,matched:1})
    expect(r.rows[0]).toMatchObject({cache:'hit',category:'technical-or-source-unavailable'})
    expect(JSON.stringify(r)).not.toContain('never export')
    expect(JSON.stringify(r)).not.toContain('apiKey')
  })
  it('fails closed on count mismatches or duplicate decisions',()=>{
    expect(waipuLoss({...waipu,totalPrograms:1},'success').status).toBe('unavailable')
    expect(joynLoss({...joyn,entries:[...joyn.entries,...joyn.entries]},'success').status).toBe('unavailable')
  })
  it('respects XMLTV title retention, even if private fields are present',()=>{
    const r=xmltvLoss(xml,'success')
    expect(r).toMatchObject({status:'counts-only-rights-restricted',titleExportPermitted:false,rows:[],lossCount:xml.selected})
    expect(JSON.stringify(r)).not.toContain('private title')
    expect(xmltvLoss({...xml,stations:{...stations,'private-title':stations[Object.keys(stations)[0]]}},'success').status).toBe('unavailable')
  })
  it('uses final YouTube review decisions, not every intermediate TMDB hypothesis',()=>{
    const r=youtubeLoss(research,queue,{cases:[{videoId:'three',status:'review-no-exact-local-tmdb-episode'}]},null,'success','failure')
    expect(r).toMatchObject({status:'complete',matched:1,lossCount:2})
    expect(r.rows.map(x=>x.reason)).toEqual(['ambiguous-work-identity','review-no-exact-local-tmdb-episode'])
    expect(r.rows[0].candidates[0]).toMatchObject({title:'Film A',score:38})
    expect(r.rows[1].metadata.episodeMarker).toEqual({season:1,episode:3})
    expect(JSON.stringify(r)).not.toContain('videoId')
    expect(youtubeLoss(research,null,null,null,'failure','skipped').status).toBe('partial-review-not-final')
  })
  it('writes independent adapter files and only same-run counts to the chain report',async()=>{
    const out=await mkdtemp(join(tmpdir(),'moviehub-loss-'))
    try {
      const payload=await writeMatcherLossReport({out,env:{GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'2'},
        input:async p=>{if(p.endsWith('/waipu.json'))return JSON.stringify(waipu);throw Error('missing')}})
      const w=JSON.parse(await readFile(join(out,'waipu.json'),'utf8'))
      const j=JSON.parse(await readFile(join(out,'joyn.json'),'utf8'))
      expect(w.rows).toHaveLength(106)
      expect(j.status).toBe('unavailable')
      const r=buildNightlyReport({stages:{},sourceData:{matcherLoss:payload},runId:'1234',runAttempt:'2',repository:'owner/repo',matcherLossArtifactId:'987'})
      expect(r.matcherLoss.artifact).toBe('matcher-loss-report-1234-2')
      expect(r.matcherLoss.adapters.waipu.lossCount).toBe(106)
      expect(nightlyMarkdown(r)).toContain('matcher-loss-report-1234-2')
      expect(nightlyMarkdown(r)).toContain('https://github.com/owner/repo/actions/runs/1234/artifacts/987')
      expect(JSON.stringify(r)).not.toContain('Candidate 0')
      expect(buildNightlyReport({stages:{},sourceData:{matcherLoss:payload},runId:'1234',runAttempt:'3'}).matcherLoss).toBeNull()
    } finally { await rm(out,{recursive:true,force:true}) }
  })
})
