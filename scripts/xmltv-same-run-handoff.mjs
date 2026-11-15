/** #336: private, single trusted runner handoff between the XMLTV matcher
 * and the existing central title inventory/executor. Never restored or uploaded. */
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { readConfirmedAiringHandoff } from './xmltv-confirmed-airing-handoff.mjs'

const MAX_BYTES=16*1024*1024
const DIRECTORY='artifacts/xmltv-handoff/private'
const FIXED_NAME='confirmed-airings.json'
const flag='MOVIEHUB_XMLTV_CANONICAL_HANDOFF'

function runIdentity(env){
  if(env[flag]!=='enabled'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID||'')||!/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT||'')||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')) throw new Error('XMLTV_HANDOFF_WORKFLOW_REJECTED')
  return {runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,sha:env.GITHUB_SHA}
}
async function privateDirectory(root,{create=false}={}){
  const dir=join(root,DIRECTORY)
  if(create) await mkdir(dir,{recursive:true,mode:0o700})
  for(const path of [join(root,'artifacts'),join(root,'artifacts/xmltv-handoff'),dir]){
    const st=await lstat(path)
    if(!st.isDirectory()||st.isSymbolicLink()||(path===dir&&(st.mode&0o077)!==0)) throw new Error('XMLTV_HANDOFF_DIRECTORY_REJECTED')
  }
  return dir
}
export async function writeXmltvSameRunHandoff(payload,{root=resolve('.'),env=process.env,now=Date.now()}={}){
  const run=runIdentity(env)
  readConfirmedAiringHandoff(payload,{now})
  const bytes=JSON.stringify({kind:'xmltv-same-run-handoff',version:1,run,payload})
  if(Buffer.byteLength(bytes)>MAX_BYTES)throw new Error('XMLTV_HANDOFF_SIZE_REJECTED')
  const path=join(await privateDirectory(root,{create:true}),FIXED_NAME)
  await writeFile(path,bytes,{flag:'wx',mode:0o600})
}

export async function readXmltvSameRunHandoff({root=resolve('.'),env=process.env,now=Date.now()}={}){
  if(!env[flag])return {active:false,titleRefs:[],events:[]}
  const expected=runIdentity(env)
  const path=join(await privateDirectory(root),FIXED_NAME),st=await lstat(path)
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size<1||st.size>MAX_BYTES) throw new Error('XMLTV_HANDOFF_FILE_REJECTED')
  const data=JSON.parse(await readFile(path,'utf8'))
  if(data?.kind!=='xmltv-same-run-handoff'||data.version!==1||
    Object.keys(data).sort().join('|')!=='kind|payload|run|version'||JSON.stringify(data.run)!==JSON.stringify(expected))
    throw new Error('XMLTV_HANDOFF_RUN_REJECTED')
  const current=readConfirmedAiringHandoff(data.payload,{now})
  // Inventory and executor use exactly the same original approved identities,
  // even if a broadcast expires between stages. The final airing file uses
  // only currently valid events and independently checks its time horizon.
  const original=readConfirmedAiringHandoff(data.payload,{now:Date.parse(data.payload.generatedAt)})
  return {active:true,titleRefs:original.titleRefs,events:current.events}
}
