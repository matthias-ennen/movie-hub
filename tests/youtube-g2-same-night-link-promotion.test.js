import {describe,it,expect} from 'vitest'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  projectSameNightKnownLinks,promoteSameNightKnownLinks,
} from '../scripts/youtube-g2-promote-same-night-best-effort.mjs'
import {
  buildYoutubeBestEffortLinkIndex,
  selectYoutubeBestEffortTitleRoute,
} from '../src/providers/youtubeBestEffortRouteIndex.js'
import {enrichTitleProviderRoutes}
  from '../src/providers/titleProviderRouteEnrichment.js'
import {readFileSync} from 'node:fs'

const NOW='2026-10-28T22:00:00.000Z'
const VIDEO='Abc12345678'
function qa(mode='rent'){
  return {
    summary:{
      kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
      generatedAt:NOW,rowsChecked:1,searchCalls:0,
      publicationPermitted:false,privateReviewArtifact:true,
      independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
      firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
    },
    rows:[{
      tmdbId:539892,status:'review-single-video-candidate',
      candidateDiscoveryMode:'trusted-previous-candidate-ids',
      tmdbDeOfferTypes:[mode],
      publicationPermitted:false,reviewedVideoId:null,directPlaybackRoute:null,
      videoCandidates:[{
        videoId:VIDEO,score:49,titleLevel:4,runtimeDelta:2.5,
        strong:true,yearMismatch:false,sequelConflict:false,
        sourceTypeRisk:false,regionSignal:'excluded',
      }],
    }],
  }
}
const index=(mode='rent')=>buildYoutubeBestEffortLinkIndex(qa(mode),{now:NOW})
const film=()=>({type:'movie',tmdbId:539892,title:'Film',
  tmdbProviderIds:['youtube'],
  tmdbProviderOffers:[{id:'youtube',offerTypes:['rent','buy']}]})
describe('automatic same-night link-only YouTube match → MovieHub badge (#388)',()=>{
  for(const mode of ['rent','buy','free','ads','flatrate']){
    it('promotes the same deep link for YouTube access type '+mode,()=>{
      const out=projectSameNightKnownLinks(index(mode),{now:NOW})
      expect(out.count).toBe(1)
      expect(out.claimedOfferTypes).toEqual([])
      expect(out.entries[0].target).toBe('https://www.youtube.com/watch?v='+VIDEO)
      const route=selectYoutubeBestEffortTitleRoute(out,film(),{
        now:Date.parse(NOW),hasYoutubeBadge:true,
      })
      expect(route?.mode).toBe('APP_DEEP_LINK')
      expect(route?.target).toBe('https://www.youtube.com/watch?v='+VIDEO)
      const title=enrichTitleProviderRoutes(film(),{
        now:Date.parse(NOW),youtubeBestEffort:out,
      })
      expect(title.titleProviderRoutes.youtube.target)
        .toBe('https://www.youtube.com/watch?v='+VIDEO)
      expect(title.titleProviderRouteEvidence.youtube)
        .toMatchObject({independentlyVerified:false,altersTmdbProviderBadge:false})
      expect(title.tmdbProviderOffers).toEqual(film().tmdbProviderOffers)
    })
  }
  it('does not invent a badge on a movie missing YouTube in TMDB',()=>{
    const out=projectSameNightKnownLinks(index(),{now:NOW})
    const noBadge={...film(),tmdbProviderIds:['google-tv'],
      tmdbProviderOffers:[]}
    expect(enrichTitleProviderRoutes(noBadge,{
      now:Date.parse(NOW),youtubeBestEffort:out,
    }).titleProviderRoutes?.youtube).toBeUndefined()
  })
  it('rejects non-fresh, untrusted or conflicting previews',()=>{
    const good=index()
    const cases=[
      x=>{x.sourceObservedAt='2026-10-27T09:00:00Z'},
      x=>{x.verifiedDEOffers=1},
      x=>{x.claimedOfferTypes=['rent']},
      x=>{x.entries[0].rankMargin=3},
      x=>{x.entries[0].score=0},
      x=>{x.entries[0].target='https://example.com/'},
      x=>{x.entries[0].videoId='bad'},
      x=>{x.entries.push({...x.entries[0],key:'movie:99',tmdbId:99});x.count=2},
      x=>{x.entries[0].provenance='untrusted'},
    ]
    for(const tamper of cases){
      const forged=structuredClone(good)
      tamper(forged)
      expect(()=>projectSameNightKnownLinks(forged,{now:NOW})).toThrow()
    }
  })
  it('writes only validated link-only public data and revokes after zero candidates',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-same-night-'))
    const input=join(dir,'review.json'),output=join(dir,'public.json')
    try{
      await writeFile(input,JSON.stringify(index()))
      const safe=await promoteSameNightKnownLinks({input,output,now:NOW})
      expect(safe.count).toBe(1)
      const out=JSON.parse(await readFile(output,'utf8'))
      expect(out.entries[0]).toMatchObject({videoId:VIDEO})
      expect(JSON.stringify(out)).not.toContain('videoCandidates')
      expect(JSON.stringify(out)).not.toContain('tmdbDeOfferTypes')
      expect(JSON.stringify(out)).not.toContain('regionSignal')
      const empty=index();empty.entries=[];empty.count=0
      await writeFile(input,JSON.stringify(empty))
      const revoked=await promoteSameNightKnownLinks({input,output,now:NOW})
      expect(revoked).toMatchObject({count:0,fallbackRetained:true})
      await expect(readFile(output,'utf8')).rejects.toMatchObject({code:'ENOENT'})
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('connects the successful SAME-PARENT recheck to same-night Firebase, without YouTube search',()=>{
    const night=readFileSync(new URL('../.github/workflows/moviehub-nightly-pipeline.yml',
      import.meta.url),'utf8')
    const deploy=readFileSync(new URL('../.github/workflows/deploy-firebase.yml',
      import.meta.url),'utf8')
    expect(night).toContain('youtube_known_recheck: ${{ needs.known-videos.result }}')
    expect(deploy).toContain('youtube_known_recheck:')
    expect(deploy).toContain("inputs.youtube_known_recheck == 'success'")
    expect(deploy).toContain('youtube-g2-global-known-no-search-${{ github.run_id }}')
    expect(deploy).toContain('youtube-g2-promote-same-night-best-effort.mjs')
    expect(deploy.indexOf('youtube-g2-promote-same-night-best-effort.mjs'))
      .toBeLessThan(deploy.indexOf('        run: npm run build'))
    expect(deploy).toContain('actions/download-artifact@v8')
    const script=readFileSync(new URL(
      '../scripts/youtube-g2-promote-same-night-best-effort.mjs',import.meta.url),'utf8')
    expect(script).not.toContain('youtubeGet(')
    expect(script).not.toContain('search.list(')
  })
})
