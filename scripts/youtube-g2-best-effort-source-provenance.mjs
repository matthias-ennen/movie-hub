/**
 * Select ONLY an authenticated, successful MAIN-branch workflow with a
 * protected link-only projection artifact and an ancestor source commit.
 * No API quotas, searches or cloud writes. Network usage here is exclusively
 * GitHub Actions read-only provenance metadata.
 */
import {mkdir,writeFile,appendFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'

export const REVIEW_WORKFLOW='.github/workflows/youtube-g2-global-known-no-search.yml'
export const SOURCE_METADATA='artifacts/youtube-g2/best-effort-promotion-source.json'
const MAX_SOURCE_AGE_MS=6*86400000
const sha=x=>/^[a-f0-9]{40}$/i.test(String(x||''))
const date=x=>Number.isFinite(Date.parse(x))
const artifactName=id=>'youtube-g2-global-known-no-search-'+id

export function validMainReviewRun(run,{repository,now=new Date().toISOString()}={}){
  const age=Date.parse(now)-Date.parse(run?.updated_at)
  return Number.isSafeInteger(run?.id)&&run.id>0
    &&run.path===REVIEW_WORKFLOW
    &&run.head_branch==='main'&&run.head_repository?.full_name===repository
    &&run.status==='completed'&&run.conclusion==='success'
    &&['push','schedule','workflow_dispatch'].includes(run.event)
    &&sha(run.head_sha)&&Number.isSafeInteger(run.run_attempt)
    &&run.run_attempt>0
    &&date(run.created_at)&&date(run.updated_at)
    &&Date.parse(run.created_at)<=Date.parse(run.updated_at)
    &&Number.isFinite(age)&&age>=-60000&&age<MAX_SOURCE_AGE_MS
}

export function validProtectedArtifact(a,run,{now=new Date().toISOString()}={}){
  const age=Date.parse(now)-Date.parse(a?.created_at)
  return Number.isSafeInteger(a?.id)&&a.id>0
    &&a.name===artifactName(run.id)&&a.expired===false
    &&Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0
    &&a.size_in_bytes<=5*1024*1024
    &&date(a.created_at)
    &&age>=-60000&&age<MAX_SOURCE_AGE_MS
    &&Date.parse(a.created_at)>=Date.parse(run.created_at)-60000
    &&Date.parse(a.created_at)<=Date.parse(run.updated_at)+60000
}

export async function selectBestEffortSource({
  runs,repository,deploySha,now=new Date().toISOString(),
  listArtifacts,compareCommits,
}={}){
  if(!sha(deploySha)||!repository||!date(now)
    ||!Array.isArray(runs)||typeof listArtifacts!=='function'
    ||typeof compareCommits!=='function')
    throw Error('YOUTUBE_BEST_EFFORT_SOURCE_INPUT_INVALID')
  for(const run of runs.slice(0,20)){
    if(!validMainReviewRun(run,{repository,now}))continue
    try{
      // Verify ancestry; do NOT accept unrelated/fork workflow commits.
      const compare=await compareCommits(run.head_sha,deploySha)
      if(!['ahead','identical'].includes(compare?.status))continue
      const artifacts=await listArtifacts(run.id)
      if(!Array.isArray(artifacts))continue
      const matches=artifacts.filter(a=>validProtectedArtifact(a,run,{now}))
      if(matches.length!==1)continue
      return {
        repository,sourceRunId:run.id,sourceSha:run.head_sha,
        sourceStartedAt:run.created_at,sourceCompletedAt:run.updated_at,
        artifactId:matches[0].id,artifactName:matches[0].name,
        selectedAt:now,provenanceVerified:true,
      }
    }catch{
      // Fail closed and look for an older *still fresh* successful run.
    }
  }
  return null
}

async function githubJson(path,token,api){
  const response=await fetch(api+path,{
    headers:{
      Accept:'application/vnd.github+json',
      Authorization:'Bearer '+token,
      'X-GitHub-Api-Version':'2022-11-28',
    },
    signal:AbortSignal.timeout(12000),
  })
  if(!response.ok)throw Error('YOUTUBE_SOURCE_GITHUB_READ_HTTP_'+response.status)
  return response.json()
}

export async function selectSourceFromGithub({
  repository=process.env.GITHUB_REPOSITORY,
  deploySha=process.env.GITHUB_SHA,
  token=process.env.GITHUB_TOKEN,
  api=process.env.GITHUB_API_URL||'https://api.github.com',
  now=new Date().toISOString(),
}={}){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository||''))
    ||!sha(deploySha)||!token||!date(now))
    throw Error('YOUTUBE_SOURCE_ACTIONS_IDENTITY_REQUIRED')
  const root='/repos/'+repository
  const query='/actions/workflows/youtube-g2-global-known-no-search.yml/runs?branch=main&status=success&per_page=20'
  const response=await githubJson(root+query,token,api)
  return selectBestEffortSource({
    runs:response.workflow_runs,repository,deploySha,now,
    compareCommits:async(source,target)=>githubJson(
      root+'/compare/'+source+'...'+target,token,api),
    listArtifacts:async(id)=>{
      const a=await githubJson(root+'/actions/runs/'+id+'/artifacts?per_page=100',token,api)
      return a.artifacts
    },
  })
}

export async function writeSourceSelection({
  output=SOURCE_METADATA,ghaOutput=process.env.GITHUB_OUTPUT,
  source=null,
}={}){
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(source)+'\n',{mode:0o600})
  if(ghaOutput){
    await appendFile(ghaOutput,
      'found='+(source?'true':'false')+'\n'
      +'run_id='+(source?.sourceRunId||'0')+'\n'
      +'artifact_name='+(source?.artifactName||'none')+'\n')
  }
  console.log(JSON.stringify({
    kind:'youtube-best-effort-source-selection',found:Boolean(source),
    sourceRunId:source?.sourceRunId||null,
    // Never output secrets, film titles, private IDs or audit data.
  }))
  return source
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  selectSourceFromGithub().catch(()=>{
    console.log('YOUTUBE_BEST_EFFORT_NO_AUTHENTICATED_SOURCE')
    return null
  }).then(source=>writeSourceSelection({source}))
    .catch(e=>{console.error(e.message);process.exitCode=1})
}
