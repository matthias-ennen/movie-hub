import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {historical,categories,plan,select100,run,TARGET,MAX_SEARCH,MAX_VIDEO} from './youtube-movies-all-categories-hundred-g1.mjs'
const manifest=JSON.parse(await readFile('docs/_work/YOUTUBE_MOVIES_G1_47_EVIDENCE_INPUT_2026-10-21.json','utf8'))
const prior=historical(manifest)
const id=n=>'Y'+String(n).padStart(10,'0')
test('original evidence intact, 47 distinct video IDs, not 47 confirmed films',()=>{
 assert.equal(prior.length,47)
 assert.equal(new Set(prior).size,47)
 assert.equal(TARGET,100)
 assert.equal(MAX_SEARCH,76)
 assert.equal(MAX_VIDEO,30)
 assert.throws(()=>historical({...manifest,expectedObservationCount:48}),/mismatch/)
})
test('all official DE and historical genre IDs are enumerated, with absent legacy disclosed',()=>{
 const d=categories({items:[
  {id:'30',snippet:{title:'Movies',assignable:false}},
  {id:'17',snippet:{title:'Sports',assignable:true}}
 ]},{items:[{id:'30',snippet:{title:'Movies'}},
  {id:'35',snippet:{title:'Documentary',assignable:false}}]})
 assert.deepEqual(d.list.map(x=>x.id),['17','30','35'])
 assert.deepEqual(d.missingHistorical,['36','39','43'])
 const q=plan(d.list)
 assert.equal(q.length,6+20)
 assert.deepEqual(q.slice(0,3).map(x=>x.id),['17','30','35'])
 assert.ok(q.slice(0,3).every(x=>x.params.type==='video'&&
  x.params.videoCategoryId&&x.params.videoDuration==='long'))
 assert.ok(q.slice(3,6).every(x=>x.params.videoType==='movie'))
})
test('category-only long videos need independent movie signal; no trailers or private/DE blocked',()=>{
 const v=(n,title,status='public',region={allowed:['DE']})=>({
  id:id(n),snippet:{title,categoryId:'30',channelTitle:'Film Portal'},
  status:{privacyStatus:status},contentDetails:{duration:'PT95M',regionRestriction:region}
 })
 const r=select100(prior,[{id:'30',mode:'category',hits:[id(1),id(2),id(3),id(4),id(5)]}],[
  v(1,'Long gaming show'),
  v(2,'Ganzer Film Abenteuertitel'),
  v(3,'Full movie trailer 2026'),
  v(4,'Ganzer Film was','private'),
  v(5,'Ganzer Film regional','public',{blocked:['DE']})
 ])
 assert.deepEqual(r.selected.map(x=>x.videoId),[id(2)])
 assert.ok(r.rejected.weak>=1)
 assert.ok(r.rejected['nonfilm-title']>=1)
 assert.equal(r.selected[0].source,'new-search')
 assert.equal(r.selected[0].signal,'full-film-title')
})
test('one mock live survey attempts every category and returns 100 real video hypotheses at most',async()=>{
 let next=0
 const details=new Map(),methods=[]
 const makeVideo=(vid,n,old=false)=>({id:vid,
  snippet:{title:old?'Movie baseline '+n:'A Film Candidate '+n,
   categoryId:String((n%8)+1),channelTitle:old?'YouTube Movies':'Independent Film Channel'},
  status:{privacyStatus:'public'},
  contentDetails:{duration:'PT95M',regionRestriction:{allowed:['DE']}}})
 for(let i=0;i<prior.length;i++)details.set(prior[i],makeVideo(prior[i],i,true))
 const api=async(endpoint,p)=>{
  methods.push({endpoint,params:p})
  if(endpoint==='videoCategories'){
   if(p.regionCode==='DE')return{items:Array.from({length:8},(_,i)=>({
    id:String(i+1),snippet:{title:'Category '+(i+1),assignable:true}}))}
   return{items:[{id:'30',snippet:{title:'Movies'}},
    {id:'35',snippet:{title:'Documentary'}}]}
  }
  if(endpoint==='search'){
   const ids=[]
   for(let i=0;i<7;i++){
    const k=++next,videoId=id(k)
    details.set(videoId,makeVideo(videoId,k))
    ids.push({id:{videoId}})
   }
   return{items:ids}
  }
  if(endpoint==='videos')return{items:p.id.split(',').map(s=>details.get(s)).filter(Boolean)}
  throw Error('Unexpected endpoint '+endpoint)
 }
 const r=await run({oldManifest:manifest,api,now:()=> '2026-10-21T15:00:00Z'})
 assert.equal(r.directory.list.length,10)
 assert.equal(r.directory.missingHistorical.includes('39'),true)
 assert.equal(r.results.filter(x=>x.mode==='category').length,10)
 assert.equal(r.results.filter(x=>x.mode==='category-movie').length,10)
 assert.equal(r.stats.searchCalls,40)
 assert.equal(r.sample.selected.length,100)
 assert.equal(r.sample.missing,0)
 assert.equal(r.sample.oldSelected+r.sample.newSelected,100)
 assert.equal(new Set(r.sample.selected.map(x=>x.videoId)).size,100)
 assert.ok(r.sample.newSelected>=53)
 assert.equal(methods.filter(x=>x.endpoint==='videoCategories').length,2)
 assert.equal(methods.filter(x=>x.endpoint==='videos').length<=MAX_VIDEO,true)
 assert.equal(methods.some(x=>x.endpoint==='search'&&x.params.type!=='video'),false)
 assert.equal(r.report.includes('NOT 100 confirmed film works'),true)
 assert.ok(r.report.includes('unverified / unknown'))
 assert.ok(!methods.some(x=>x.endpoint==='movie'||x.endpoint==='firestore'))
})
test('quota 403 stops further search calls, records gap without fabricated films',async()=>{
 let calls=0
 const r=await run({oldManifest:manifest,api:async(endpoint,p)=>{
  if(endpoint==='videoCategories')return{items:[{id:'30',snippet:{title:'Movies'}}]}
  if(endpoint==='search'){calls++;throw Error('YouTube API: HTTP 403 bei search')}
  if(endpoint==='videos')return{items:[]}
  throw Error('unexpected')
 }})
 assert.equal(calls,1)
 assert.equal(r.stats.quotaStopped,true)
 assert.equal(r.stats.searchCalls,1)
 assert.equal(r.sample.selected.length,0)
 assert.equal(r.sample.missing,100)
 assert.ok(r.report.includes('quota-or-rate-limit'))
})
test('new titles are never promoted to confirmed film, offer, DE entitlement or TMDB id',()=>{
 const priorOne=prior[0]
 const r=select100(prior,[{id:'30',mode:'category-movie',hits:[id(8)]}],[
  {id:priorOne,snippet:{title:'Existing Movie',channelTitle:'YouTube Movies',categoryId:'30'},
   status:{privacyStatus:'public'},contentDetails:{duration:'PT110M',regionRestriction:{allowed:['DE']}}},
  {id:id(8),snippet:{title:'New movie candidate',channelTitle:'Some Channel',categoryId:'30'},
   status:{privacyStatus:'public'},contentDetails:{duration:'PT110M',regionRestriction:{allowed:['DE']}}}
 ])
 assert.equal(r.selected.length,2)
 assert.equal(r.selected.every(x=>!('tmdbId' in x)&&!('offerType' in x)),true)
 assert.equal(r.distinctTitleStrings,2)
})
