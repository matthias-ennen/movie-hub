import {describe,it,expect} from 'vitest'
import {YOUTUBE_G2_GOLDEN_CASES,auditYoutubeG2GoldenSet}
  from '../scripts/youtube-g2-golden-quality-set.mjs'
import {planCuratedTmdbTitleQueries}
  from '../scripts/youtube-g2-curated-title-query-plan.mjs'

describe('YouTube G2 AP1 golden set across both adapter directions',()=>{
  it('preserves two distinct source directions and no independently approved offers',()=>{
    const audit=auditYoutubeG2GoldenSet()
    expect(audit).toMatchObject({schemaVersion:1,count:10,
      byDirection:{'youtube-first':8,'tmdb-first':2},
      verifiedOffers:0,publicationPermitted:false})
  })
  it('keeps First Blood distinct from Rambo III and from TV alternatives',()=>{
    const c=YOUTUBE_G2_GOLDEN_CASES.find(x=>x.id==='first-blood-work')
    expect(c.expectedTmdbId).toBe(1368)
    expect(c.forbiddenTmdbIds).toContain(1370)
    expect(c.gate).toBe('film-vs-tv-review')
  })
  it('does not silently pick FREE over a competing rent/buy version',()=>{
    const pair=YOUTUBE_G2_GOLDEN_CASES.filter(x=>x.gate==='competing-versions-review')
    expect(pair).toHaveLength(2)
    expect(pair[0].competingVideoId).toBe(pair[1].videoId)
    expect(pair[1].competingVideoId).toBe(pair[0].videoId)
    expect(pair.every(x=>!x.offerVerified)).toBe(true)
  })
  it('keeps region-excluded and short clips separate from missing video metadata',()=>{
    expect(YOUTUBE_G2_GOLDEN_CASES.find(x=>x.id==='das-boot-de-excluded').gate)
      .toBe('region-excluded')
    expect(YOUTUBE_G2_GOLDEN_CASES.find(x=>x.id==='odyssey-short').gate)
      .toBe('short-video-not-full-film')
  })
  it('rejects contradictory approvals, duplicate videos and missing competing routes',()=>{
    const copy=()=>YOUTUBE_G2_GOLDEN_CASES.map(x=>({...x}))
    const a=copy();a[0].offerVerified=true
    expect(()=>auditYoutubeG2GoldenSet(a)).toThrow('G2_GOLDEN_CASE_INVALID')
    const b=copy();b[1].videoId=b[0].videoId
    expect(()=>auditYoutubeG2GoldenSet(b)).toThrow('G2_GOLDEN_VIDEO_INVALID')
    const c=copy();c[1].competingVideoId='ZZZZZZZZZZZ'
    expect(()=>auditYoutubeG2GoldenSet(c)).toThrow('G2_GOLDEN_COMPETITOR_NOT_IN_SET')
  })
})
