import {observeNightly} from './nightly-report-metrics.mjs'
/** #336: common deployment boundary, run before series and TV projections.
 * Disabled releases publish ONLY an empty manifest to enable an unambiguous
 * first activation; there are no AIR broadcasts or links in that manifest. */
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { XMLTV_AIR_PUBLISH_ENABLED } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { readXmltvSameRunHandoff } from './xmltv-same-run-handoff.mjs'
import { planXmltvAirSourceFiles } from './xmltv-air-release-plan.mjs'
import { buildXmltvAirPublication, readXmltvAirPublication, fetchXmltvAirPublication } from './xmltv-air-publication.mjs'

async function readSafe(path,max){
  try{
    const stat=await lstat(path)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max)throw new Error('Invalid AIR deployment file')
    return await readFile(path,'utf8')
  }catch(error){if(error.code==='ENOENT')return null;throw error}
}
async function readLocal(directory){
  const restored=await readXmltvAirPublication({read:(path,max)=>readSafe(resolve(directory,path),max)})
  const expected=new Set(restored.files.map(row=>row.directory))
  for(const dir of await readdir(directory,{withFileTypes:true})){
    if(dir.name.startsWith('air-')&&dir.name.endsWith('-live')&&(!dir.isDirectory()||!expected.has(dir.name)))throw new Error('Unexpected AIR deployment directory')
  }
  return restored
}
export async function prepareXmltvAirDeployment({root=resolve('.'),env=process.env,now=Date.now(),enabled=XMLTV_AIR_PUBLISH_ENABLED,fetchImpl=fetch}={}){
  const directory=resolve(root,'public')
  let freshFiles=[],retainedFiles=[],catalog={titles:[]}
  if(enabled){
    catalog=JSON.parse(await readSafe(resolve(directory,'catalog.json'),96*1024*1024))
    const restored=await fetchXmltvAirPublication({fetchImpl})
    retainedFiles=restored.files
    const handoff=await readXmltvSameRunHandoff({root,env,now})
    if(handoff.active)freshFiles=planXmltvAirSourceFiles({confirmedEvents:handoff.events,catalog,now}).files
  }
  const publication=buildXmltvAirPublication({freshFiles,retainedFiles,catalog,now})
  // Never overwrite or follow an unexpected checkout directory or symlink.
  const targetDirectories=new Set(Object.keys(publication.entries).map(path=>dirname(path)))
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(entry.name.startsWith('air-')&&entry.name.endsWith('-live')&&!targetDirectories.has(entry.name))throw new Error('Unexpected AIR deployment directory')
  }
  for(const parent of targetDirectories){
    const target=resolve(directory,parent)
    await mkdir(target,{recursive:true})
    const stat=await lstat(target)
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Invalid AIR deployment directory')
  }
  for(const [path,bytes] of Object.entries(publication.entries))await writeFile(resolve(directory,path),bytes,{flag:'wx'})
  await readLocal(directory)
  return {enabled,...publication.counts,stations:publication.manifest.stations.length}
}

export async function verifyXmltvAirDeployment({directory='public',dist='dist',prepared=false,fetchImpl=fetch}={}){
  const expected=await readLocal(directory)
  const actual=prepared?await readLocal(dist):await fetchXmltvAirPublication({fetchImpl})
  if(JSON.stringify(expected.manifest)!==JSON.stringify(actual.manifest))throw new Error('Published generation differs from build: XMLTV AIR manifest')
  return {stations:expected.files.length}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const action=process.argv[2]
  try{
    if(action==='prepare'){
      const result=await prepareXmltvAirDeployment()
      await observeNightly('xmltv-publication',result)
      console.log(JSON.stringify(result))
    }
    else if(action==='verify-prepared'||action==='verify-hosted')console.log(JSON.stringify(await verifyXmltvAirDeployment({prepared:action==='verify-prepared'})))
    else throw new Error('Invalid AIR deployment action')
  }catch(error){console.error(error.message);process.exitCode=1}
}
