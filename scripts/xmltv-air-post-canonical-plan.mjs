/** After the existing central executor, validate the real same-run XMLTV
 * source-file plan without writing any AIR/public source files yet. */
import {observeNightly} from './nightly-report-metrics.mjs'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readXmltvSameRunHandoff } from './xmltv-same-run-handoff.mjs'
import { planXmltvAirSourceFiles } from './xmltv-air-release-plan.mjs'

export async function checkPostCanonicalXmltvPlan({root=resolve('.'),env=process.env,now=Date.now()}={}){
  const handoff=await readXmltvSameRunHandoff({root,env,now})
  if(!handoff.active) throw new Error('XMLTV canonical handoff is not enabled')
  const path=resolve(root,'public/catalog.json'),info=await lstat(path)
  if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>96*1024*1024) throw new Error('XMLTV canonical catalog rejected')
  const catalog=JSON.parse(await readFile(path,'utf8'))
  const plan=planXmltvAirSourceFiles({confirmedEvents:handoff.events,catalog,now})
  // No title, airing, source URL, original provenance or TMDB ID in logs.
  return {kind:'xmltv-post-canonical-air-plan',schemaVersion:1,...plan.counts,
    stationsWithAirings:plan.files.length,publicAirFilesWritten:0}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  checkPostCanonicalXmltvPlan().then(async report=>{await observeNightly('xmltv-canonical',report);console.log(JSON.stringify(report))}).catch(()=>{
    console.error('XMLTV post-canonical plan rejected; no AIR files written')
    process.exitCode=1
  })
}
