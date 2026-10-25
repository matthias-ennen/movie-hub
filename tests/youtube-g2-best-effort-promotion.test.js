import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,writeFile,readFile,access,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
import {
  validMainReviewRun,validProtectedArtifact,selectBestEffortSource,
} from '../scripts/youtube-g2-best-effort-source-provenance.mjs'
import {
  safePublicBestEffortProjection,promoteBestEffortLinks,
} from '../scripts/youtube-g2-best-effort-promote.mjs'
import {buildYoutubeBestEffortLinkIndex,selectYoutubeBestEffortTitleRoute}
  from '../src/providers/youtubeBestEffortRouteIndex.js'

const NOW='2026-10-25T14:00:00Z'
const REVIEW='2026-10-25T13:00:00Z'
const repo='matthias-ennen/movie-hub'
const sourceSha='a'.repeat(40),deploySha='b'.repeat(40)
const run=()=>({
  id:7001,status:'completed',conclusion:'success',head_branch:'main',
  head_repository:{full_name:repo},
  path:'.github/workflows/youtube-g2-global-known-no-search.yml',
  event:'push',run_attempt:1,head_sha:sourceSha,
  created_at:'2026-10-25T12:55:00Z',
  updated_at:'2026-10-25T13:05:00Z',
})
const art=()=>({
  id:8001,name:'youtube-g2-global-known-no-search-7001',expired:false,
  size_in_bytes:20000,created_at:'2026-10-25T13:04:00Z',
})
const metadata=()=>({
  repository:repo,sourceRunId:7001,sourceSha,
  sourceStartedAt:run().created_at,sourceCompletedAt:run().updated_at,
  artifactId:8001,artifactName:art().name,
  selectedAt:NOW,provenanceVerified:true,
})
const qa=()=>({
  summary:{
    kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
    generatedAt:REVIEW,rowsChecked:1,searchCalls:0,
    privateReviewArtifact:true,publicationPermitted:false,
    independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
    firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
  },
  rows:[{
    tmdbId:100,status:'review-single-video-candidate',
    candidateDiscoveryMode:'trusted-previous-candidate-ids',
    tmdbDeOfferTypes:['rent','buy'],reviewedVideoId:null,
    directPlaybackRoute:null,publicationPermitted:false,
    videoCandidates:[{
      videoId:'0nBiidtN7ZU',score:45,titleLevel:4,runtimeDelta:2,
      strong:true,yearMismatch:false,sequelConflict:false,sourceTypeRisk:false,
      regionSignal:'unknown',
    }],
  }],
})
const preview=()=>buildYoutubeBestEffortLinkIndex(qa(),{now:REVIEW})

describe('trusted Github source run selection, not private QA publication',()=>{
  it('requires one completed main repo run, full artifact and source ancestry',async()=>{
    const good=run()
    expect(validMainReviewRun(good,{repository:repo,now:NOW})).toBe(true)
    expect(validProtectedArtifact(art(),good,{now:NOW})).toBe(true)
    const compare=vi.fn(async()=>({status:'ahead'}))
    const find=vi.fn(async()=>[art()])
    expect(await selectBestEffortSource({
      runs:[good],repository:repo,deploySha,now:NOW,
      listArtifacts:find,compareCommits:compare,
    })).toMatchObject({sourceRunId:7001,sourceSha,artifactId:8001,
      provenanceVerified:true})
    expect(compare).toHaveBeenCalledWith(sourceSha,deploySha)
    expect(find).toHaveBeenCalledWith(7001)
  })
  it('rejects fork/branch/failure/expired/outdated/replaced review artifact',async()=>{
    for(const alter of [
      x=>{x.head_branch='feature'},
      x=>{x.head_repository.full_name='fork/movie-hub'},
      x=>{x.conclusion='failure'},
      x=>{x.status='in_progress'},
      x=>{x.path='.github/workflows/other.yml'},
      x=>{x.updated_at='2026-10-01T12:00:00Z'},
      x=>{x.head_sha='invalid'},
      x=>{x.event='pull_request'},
    ]){
      const bad=run();alter(bad)
      expect(validMainReviewRun(bad,{repository:repo,now:NOW})).toBe(false)
    }
    for(const alter of [
      x=>{x.expired=true},
      x=>{x.name='other'},
      x=>{x.size_in_bytes=6000000},
      x=>{x.created_at='2026-10-01T12:00:00Z'},
    ]){
      const bad=art();alter(bad)
      expect(validProtectedArtifact(bad,run(),{now:NOW})).toBe(false)
    }
    const opts={runs:[run()],repository:repo,deploySha,now:NOW,
      listArtifacts:async()=>[art()],compareCommits:async()=>({status:'behind'})}
    expect(await selectBestEffortSource(opts)).toBeNull()
    expect(await selectBestEffortSource({...opts,
      compareCommits:async()=>({status:'diverged'})})).toBeNull()
    expect(await selectBestEffortSource({...opts,
      compareCommits:async()=>({status:'ahead'}),
      listArtifacts:async()=>[art(),art()]})).toBeNull()
    expect(await selectBestEffortSource({...opts,
      compareCommits:async()=>{throw Error('rate limited')},
    })).toBeNull()
  })
})

describe('revocable minimal public best-effort promotion',()=>{
  it('promotes a strong link ONLY from verified source, strips any private fields',()=>{
    const p=preview()
    p.entries[0].privateProfileName='SECRET never leak'
    p.sourceVideoCandidates=['UNKNOWN-PRIVATE']
    const safe=safePublicBestEffortProjection(p,metadata(),{now:NOW,repository:repo})
    expect(safe.count).toBe(1)
    expect(safe.entries[0]).toMatchObject({
      key:'movie:100',tmdbId:100,videoId:'0nBiidtN7ZU',
      target:'https://www.youtube.com/watch?v=0nBiidtN7ZU',
    })
    expect(JSON.stringify(safe)).not.toContain('SECRET')
    expect(JSON.stringify(safe)).not.toContain('UNKNOWN-PRIVATE')
    expect(JSON.stringify(safe)).not.toContain('"rent"')
    expect(selectYoutubeBestEffortTitleRoute(safe,{
      type:'movie',tmdbId:100,
    },{now:Date.parse(NOW),hasYoutubeBadge:true})).not.toBeNull()
  })
  it('prevents bad provenance, future, stale or tariff-modified link indexes',()=>{
    const p=preview()
    for(const alter of [
      x=>{x.source.provenanceVerified=false},
      x=>{x.source.repository='some-fork/movie-hub'},
      x=>{x.source.sourceCompletedAt='2026-10-01T13:00:00Z'},
      x=>{x.source.sourceStartedAt='2026-10-25T13:10:00Z'},
      x=>{x.preview.verifiedDEOffers=1},
      x=>{x.preview.claimedOfferTypes=['free']},
      x=>{x.preview.generatedAt='2027-01-01T00:00:00Z'},
      x=>{x.preview.sourceObservedAt='2026-10-01T00:00:00Z'},
      x=>{x.preview.entries[0].videoId='invalid'},
      x=>{x.preview.entries[0].target='https://evil.example'},
      x=>{x.preview.entries[0].score=10},
      x=>{x.preview.entries[0].rankMargin=4},
      x=>{x.preview.entries[0].quality='verified'},
      x=>{x.preview.entries.push({...x.preview.entries[0]});x.preview.count=2},
      x=>{x.preview.entries.push({...x.preview.entries[0],key:'movie:200',
        tmdbId:200});x.preview.count=2},
    ]){
      const x={source:structuredClone(metadata()),preview:structuredClone(p)}
      alter(x)
      expect(()=>safePublicBestEffortProjection(x.preview,x.source,{
        now:NOW,repository:repo,
      })).toThrow()
    }
  })
  it('writes only minimal public JSON and removes it when source is missing',async()=>{
    const folder=await mkdtemp(join(tmpdir(),'youtube-promote-'))
    const sourceFile=join(folder,'meta.json')
    const privatePreview=join(folder,'private.json')
    const output=join(folder,'public','youtube-best-effort-title-links.json')
    try{
      await writeFile(sourceFile,JSON.stringify(metadata()))
      await writeFile(privatePreview,JSON.stringify(preview()))
      const promoted=await promoteBestEffortLinks({
        sourceFile,privatePreview,output,now:NOW,repository:repo,
      })
      expect(promoted.count).toBe(1)
      expect(JSON.parse(await readFile(output,'utf8'))).toEqual(promoted)
      await writeFile(sourceFile,'null')
      expect(await promoteBestEffortLinks({
        sourceFile,privatePreview,output,now:NOW,repository:repo,
      })).toBeNull()
      await expect(access(output)).rejects.toThrow()
    }finally{await rm(folder,{recursive:true,force:true})}
  })
  it('deployment integration precedes build, does not copy original QA and sets no-store',()=>{
    const file=readFileSync(new URL('../.github/workflows/deploy-firebase.yml',
      import.meta.url),'utf8')
    const sourceAt=file.indexOf('id: youtube_best_effort_source')
    const downloadAt=file.indexOf('id: youtube_best_effort_download')
    const promoteAt=file.indexOf('node scripts/youtube-g2-best-effort-promote.mjs')
    const buildAt=file.indexOf('run: npm run build',promoteAt)
    expect(sourceAt).toBeGreaterThan(0)
    expect(downloadAt).toBeGreaterThan(sourceAt)
    expect(promoteAt).toBeGreaterThan(downloadAt)
    expect(buildAt).toBeGreaterThan(promoteAt)
    expect(file).toContain('actions/download-artifact@v7')
    expect(file).toContain("steps.youtube_best_effort_source.outputs.found == 'true'")
    expect(file).not.toContain('cp artifacts/youtube-g2/global-known-no-search-review/qa.json public/')
    const firebase=JSON.parse(readFileSync(new URL('../firebase.json',
      import.meta.url),'utf8'))
    const header=firebase.hosting.headers.find(h=>
      h.source==='/youtube-best-effort-title-links.json')
    expect(header.headers).toContainEqual({key:'Cache-Control',value:'no-store'})
  })
})
