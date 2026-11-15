import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildConfirmedAiringHandoff } from '../scripts/xmltv-confirmed-airing-handoff.mjs'
import { readXmltvSameRunHandoff, writeXmltvSameRunHandoff } from '../scripts/xmltv-same-run-handoff.mjs'
import { buildTitleCandidateInventory } from '../scripts/build-title-candidate-inventory.mjs'
import { buildTitlePriorityPreview } from '../scripts/build-title-priority-preview.mjs'
import { buildCanonicalFanoutPlan, executeTitlePriorityQueue, validateXmltvCanonicalHandoff } from '../scripts/execute-title-priority-queue.mjs'
import { checkPostCanonicalXmltvPlan } from '../scripts/xmltv-air-post-canonical-plan.mjs'

const now=Date.parse('2026-11-16T00:00:00Z'), dirs=[]
const env={MOVIEHUB_XMLTV_CANONICAL_HANDOFF:'enabled',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
  GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40)}
const event={kind:'broadcast',titleRef:{mediaType:'movie',tmdbId:42},channelId:'zdf',channelName:'ZDF',
  startAt:'2026-11-16T19:00:00Z',endAt:'2026-11-16T21:00:00Z',
  sourceRefs:[{sourceId:'xmltv:epgshare01',externalId:'ZDF.de|PRIVATE TITLE'}],
  extensions:{xmltv:{sourceStationId:'ZDF.de',timestampsExplicitlyZoned:true,rawTitle:'PRIVATE TITLE'}}}
const complete={source:'tmdb',type:'movie',mediaType:'movie',tmdbId:42,title:'Canonical film',
  metadataVersion:3,metadataComplete:true,collectionChecked:true,metadataUpdatedAt:new Date(now).toISOString(),
  metadataChecks:{details:'present',artwork:'present',ageRating:'absent',credits:'present',keywords:'absent',videos:'absent',providers:'absent',collection:'absent'},
  tmdbProviderIds:[]}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'moviehub-xmltv-run-'));dirs.push(root);return root}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(root=>rm(root,{recursive:true,force:true})))})

describe('same-run XMLTV central pipeline handoff',()=>{
  it('normal runs never read a handoff; explicit runs refuse a missing or different runner identity',async()=>{
    const root=await fixture()
    expect(await readXmltvSameRunHandoff({root,env:{},now})).toEqual({active:false,titleRefs:[],events:[]})
    const payload=buildConfirmedAiringHandoff([event],{now})
    await expect(readXmltvSameRunHandoff({root,env,now})).rejects.toThrow()
    await expect(writeXmltvSameRunHandoff(payload,{root,env:{...env,GITHUB_EVENT_NAME:'push'},now})).rejects.toThrow(/WORKFLOW/)
    await writeXmltvSameRunHandoff(payload,{root,env,now})
    await expect(readXmltvSameRunHandoff({root,env:{...env,GITHUB_RUN_ATTEMPT:'2'},now})).rejects.toThrow(/RUN_REJECTED/)
    await expect(writeXmltvSameRunHandoff(payload,{root,env,now})).rejects.toThrow()
    const path=join(root,'artifacts/xmltv-handoff/private/confirmed-airings.json')
    expect(await readFile(path,'utf8')).not.toContain('PRIVATE TITLE')
    await chmod(path,0o644)
    await expect(readXmltvSameRunHandoff({root,env,now})).rejects.toThrow(/FILE_REJECTED/)
  })
  it('reuses a complete canonical copy, adds the title once and prepares the actual source plan without AIR files',async()=>{
    const root=await fixture(), catalog={titles:[]}
    await writeXmltvSameRunHandoff(buildConfirmedAiringHandoff([event,event],{now}),{root,env,now})
    const handoff=await readXmltvSameRunHandoff({root,env,now})
    const inventory=buildTitleCandidateInventory({catalog,xmltvApprovedTitles:handoff.titleRefs,generatedAt:new Date(now).toISOString()})
    const preview=buildTitlePriorityPreview({inventory,capacity:800,generatedAt:new Date(now).toISOString()})
    expect(preview.selectedKeys).toEqual(['movie:42'])
    expect([...validateXmltvCanonicalHandoff(handoff.titleRefs,inventory,preview.queue)]).toEqual(['movie:42'])
    expect(()=>validateXmltvCanonicalHandoff([],inventory,preview.queue)).toThrow(/parity/)
    expect(()=>validateXmltvCanonicalHandoff(handoff.titleRefs,inventory,[{...preview.queue[0],sources:['browse']}])).toThrow(/parity/)
    const execution=await executeTitlePriorityQueue({preview,candidateValues:new Map([['movie:42',[complete]]]),
      now:new Date(now),loadTitle:()=>{throw new Error('No TMDB request expected')}})
    expect(execution.summary.counts.reused).toBe(1)
    const plan=buildCanonicalFanoutPlan({catalog,updates:execution.updates,xmltvApprovedKeys:validateXmltvCanonicalHandoff(handoff.titleRefs,inventory,preview.queue)})
    expect(plan.catalog.titles.map(x=>x.tmdbId)).toEqual([42])
    await mkdir(join(root,'public'))
    await writeFile(join(root,'public/catalog.json'),JSON.stringify(plan.catalog))
    const report=await checkPostCanonicalXmltvPlan({root,env,now})
    expect(report).toMatchObject({completeUniqueTitles:1,projected:2,deduplicated:1,stationsWithAirings:1,publicAirFilesWritten:0})
    await expect(readFile(join(root,'public/air-zdf-live/titles.json'))).rejects.toThrow()
    const expired=await readXmltvSameRunHandoff({root,env,now:Date.parse('2026-11-16T22:00:00Z')})
    expect(expired.titleRefs).toEqual([{type:'movie',tmdbId:42}])
    expect(expired.events).toEqual([])
  })
})
