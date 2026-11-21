import { describe, it, expect } from 'vitest'
import {createMembershipRequestAudit,membershipInputFingerprints,compareMembershipAudits} from '../scripts/youtube-g2-membership-audit.mjs'
const entry=(videoId,videoTitle='Test',playlistModes=['free'])=>({videoId,videoTitle,minutes:90,screened:true,playlistModes})
function snapshot(candidates,queries=null){return {schemaVersion:1,inputs:membershipInputFingerprints(candidates),queries}}
describe('private YouTube membership audit',()=>{
  it('separates starts, successes, failures, hits and skipped budget per endpoint',()=>{
    const audit=createMembershipRequestAudit()
    const a=audit.track('/search/movie',{query:'Secret title',page:1});a.start();a.success()
    audit.track('/search/movie',{page:1,query:'Secret title'}).cacheHit()
    const b=audit.track('/search/tv',{query:'Secret title'});b.start();b.fail()
    audit.track('/movie/12',{}).skipped()
    const result=audit.finish()
    expect(result.queries).toHaveLength(3)
    expect(result.byEndpoint.searchMovie).toEqual({lookups:2,actualStarts:1,successes:1,failures:0,cacheHits:1,budgetSkipped:0})
    expect(result.byEndpoint.searchTv.failures).toBe(1)
    expect(result.byEndpoint.movieDetail.budgetSkipped).toBe(1)
    expect(JSON.stringify(result)).not.toContain('Secret title')
  })
  it('distinguishes source changes, list changes, added/removed and unchanged entries',()=>{
    const old=snapshot([entry('a'),entry('b'),entry('c'),entry('d')])
    const next=snapshot([entry('a'),entry('b','New'),entry('c','Test',['rent-buy']),entry('e')])
    expect(compareMembershipAudits(old,next)).toEqual({added:1,removed:1,unchanged:1,changedEvidence:1,changedMembershipOnly:1,repeatedSuccessfulQueryKeys:null,repeatedActualStarts:null})
  })
  it('measures only prior successful request fingerprints, not unobserved or failed ones',()=>{
    const old=createMembershipRequestAudit()
    const a=old.track('/search/movie',{query:'A'});a.start();a.success()
    const b=old.track('/search/movie',{query:'B'});b.start();b.fail()
    const next=createMembershipRequestAudit()
    for(const query of ['A','B','C']){const r=next.track('/search/movie',{query});r.start();r.success()}
    const result=compareMembershipAudits(snapshot([],old.finish().queries),snapshot([],next.finish().queries))
    expect(result).toMatchObject({repeatedSuccessfulQueryKeys:1,repeatedActualStarts:1})
    expect(compareMembershipAudits({schemaVersion:1,inputs:[null],queries:[]},snapshot([]))).toBeNull()
  })
})
