import {describe,it,expect} from 'vitest'
import {buildTmdbFirstReviewPack,renderTmdbFirstReviewPack}
  from '../scripts/youtube-g2-tmdb-first-review-pack.mjs'

const video=(id,strong=true)=>({videoId:id,videoTitle:'Full original work',
  channelTitle:'Example publisher',durationMinutes:100,runtimeDelta:1,strong})
function fixture(){
  const rows=[
    {tmdbId:101,status:'review-single-video-candidate',videoCandidates:[video('QZx12345678')],tmdbDeOfferTypes:['rent']},
    {tmdbId:102,status:'review-single-video-candidate',videoCandidates:[video('ABC12345678',false)],tmdbDeOfferTypes:['buy']},
    {tmdbId:103,status:'review-multiple-video-editions',videoCandidates:[video('Xyz12345678'),video('ABc12345678')],tmdbDeOfferTypes:['rent']},
    {tmdbId:104,status:'review-weak-or-unresolved-videos',videoCandidates:[video('Xyz12345678',false)],tmdbDeOfferTypes:['rent']},
    {tmdbId:105,status:'no-current-public-youtube-badge',videoCandidates:[],tmdbDeOfferTypes:[]},
  ].map(x=>({mediaType:'movie',title:'Film '+x.tmdbId,publicationPermitted:false,
    directPlaybackRoute:null,reviewedVideoId:null,...x}))
  return {summary:{mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',selectedMovies:5,processedMovies:4,
    statusCounts:{'review-single-video-candidate':2,
      'review-multiple-video-editions':1,'review-weak-or-unresolved-videos':1,
      'no-current-public-youtube-badge':1},
    publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
    calls:{youtubeSearches:8}},rows}
}
describe('YouTube G2 – private TMDB-first bundled evidence review',()=>{
  it('keeps all historical rows, including disappeared badge, but researches only four',()=>{
    const pack=buildTmdbFirstReviewPack(fixture())
    expect(pack.sourceSelectedFilms).toBe(5)
    expect(pack.actuallyApiResearchedMovies).toBe(4)
    expect(pack.lanes).toEqual({
      'compare-editions-and-publishers':1,
      'historical-badge-vanished-do-not-restore':1,
      'resolve-film-work-or-edition':1,
      'verify-exact-work-offer-and-playback':2,
    })
    expect(pack.items.every(x=>x.independentOfferApproved===false
      &&x.playbackRoute===null&&x.publicationPermitted===false)).toBe(true)
    expect(pack.verifiedDEOffers).toBe(0)
    expect(pack.approvedDirectLinks).toBe(0)
    expect(renderTmdbFirstReviewPack(pack)).toContain('4** von **5**')
  })
  it('does not mistake a shared weak search hit for a strong cross-work video conflict',()=>{
    const p=buildTmdbFirstReviewPack(fixture())
    expect(p.items.some(x=>x.lane==='cross-work-video-id-conflict')).toBe(false)
  })
  it('flags both films when one exact video is rated strong for two different works',()=>{
    const qa=fixture();qa.rows[3].videoCandidates[0].strong=true
    const p=buildTmdbFirstReviewPack(qa)
    expect(p.lanes['cross-work-video-id-conflict']).toBe(2)
    expect(p.items.filter(x=>x.lane==='cross-work-video-id-conflict').length).toBe(2)
    expect(p.items.filter(x=>x.lane==='cross-work-video-id-conflict')
      .every(x=>x.candidateVideos.some(c=>c.conflictingOtherMovie))).toBe(true)
  })
  it('preserves every bounded original candidate including alternatives after top three',()=>{
    const qa=fixture()
    const candidates=qa.rows[2].videoCandidates
    for(const id of ['More1234567','More2345678','More3456789']){
      candidates.push(video(id,false))
    }
    expect(candidates).toHaveLength(5)
    const pack=buildTmdbFirstReviewPack(qa)
    const row=pack.items.find(x=>x.tmdbId===103)
    expect(row.candidateVideos.map(x=>x.videoId))
      .toEqual(candidates.map(x=>x.videoId))
    expect(renderTmdbFirstReviewPack(pack)).toContain('More3456789')
    expect(pack.approvedDirectLinks).toBe(0)
    expect(pack.publicationPermitted).toBe(false)
  })
  it('rejects forged grants, writes, duplicates and mismatched source totals',()=>{
    for(const mutate of [
      x=>x.summary.firestoreWrites=1,
      x=>x.rows[0].publicationPermitted=true,
      x=>x.rows[0].directPlaybackRoute='https://www.youtube.com/watch?v=QZx12345678',
      x=>x.rows[1].tmdbId=x.rows[0].tmdbId,
      x=>x.summary.statusCounts['review-single-video-candidate']=3,
      x=>x.rows[0].videoCandidates[0].videoId='unsafe',
      x=>x.rows.pop(),
    ]){
      const qa=fixture();mutate(qa)
      expect(()=>buildTmdbFirstReviewPack(qa)).toThrow()
    }
  })
})
