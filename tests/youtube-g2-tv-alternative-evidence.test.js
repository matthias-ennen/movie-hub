import {describe,it,expect} from 'vitest'
import {reviewTvSearchAlternatives} from '../scripts/youtube-g2-tv-alternative-evidence.mjs'

const film={id:1266,title:'Street Kings',original_title:'Street Kings',
  release_date:'2008-04-10',runtime:109,alternative_titles:{titles:[]}}
const tv=(id,name,first_air_date,original_name=name)=>({
  id,name,original_name,first_air_date,
})
describe('G2: search/tv suggestions are evidence, not automatically material works',()=>{
  it('excludes only an unequivocally unrelated, old/new, named TV hit',()=>{
    const r=reviewTvSearchAlternatives({
      sourceTitle:'Street Kings',movie:film,
      tvResults:[
        tv(111,'Modern Gardening Competitions','2023-04-02'),
        tv(222,'Street Kings','2023-04-02'),
        tv(333,'Documentary About Kings','2023-04-02'),
      ],
    })
    expect(r.rawTvIds).toEqual([111,222,333])
    expect(r.unrelatedTvIds).toEqual([111])
    expect(r.alternativeTvIds).toEqual([222,333])
    expect(r.candidates[0].disposition).toBe('clearly-unrelated-search-hit')
  })
  it('never dismisses TV work with an identical, overlapping or alternate original title',()=>{
    const r=reviewTvSearchAlternatives({
      sourceTitle:'Street Kings',movie:film,tvResults:[
        tv(1,'Street Kings','2022-01-01'),
        tv(2,'Die anderen','2024-04-02','Street Kings'),
        tv(3,'Kings on the Street','2025-01-01'),
      ],
    })
    expect(r.alternativeTvIds).toEqual([1,2,3])
    expect(r.unrelatedTvIds).toHaveLength(0)
  })
  it('retains unknown title, year, movie year and ambiguous short movie titles',()=>{
    for(const hit of [
      tv(1,'','2024-04-02',''),
      tv(2,'Modern Gardening Competitions','','Field Games'),
      tv(3,'Modern Gardening Competitions','2009-04-02'),
    ]){
      const r=reviewTvSearchAlternatives({sourceTitle:'Street Kings',
        movie:film,tvResults:[hit]})
      expect(r.alternativeTvIds).toEqual([hit.id])
    }
    expect(reviewTvSearchAlternatives({sourceTitle:'Street Kings',
      movie:{...film,release_date:''},
      tvResults:[tv(4,'Modern Gardening Competitions','2024-04-02')],
    }).alternativeTvIds).toEqual([4])
    expect(reviewTvSearchAlternatives({sourceTitle:'IT',
      movie:{...film,title:'IT',original_title:'IT'},
      tvResults:[tv(5,'Modern Gardening Competitions','2024-04-02')],
    }).alternativeTvIds).toEqual([5])
  })
  it('retains TV candidates with matching TMDB alternative movie names',()=>{
    const movie={...film,alternative_titles:{titles:[{title:'Secret Garden'}]}}
    const r=reviewTvSearchAlternatives({sourceTitle:'Street Kings',
      movie,tvResults:[tv(42,'Secret Garden','2024-04-02')]})
    expect(r.alternativeTvIds).toEqual([42])
  })
  it('deduplicates video-independent TV IDs and fails closed on bad collections',()=>{
    const r=reviewTvSearchAlternatives({sourceTitle:'Street Kings',movie:film,
      tvResults:[tv(1,'Street Kings','2001-01-01'),
        tv(1,'Street Kings','2001-01-01'),{id:null},tv(2,'Other Name','2025-01-01')]})
    expect(r.rawTvIds).toEqual([1,2])
    expect(()=>reviewTvSearchAlternatives({tvResults:{}}))
      .toThrow('YOUTUBE_TV_EVIDENCE_RESULTS_INVALID')
  })
})
