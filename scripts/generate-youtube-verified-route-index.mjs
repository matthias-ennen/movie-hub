/**
 * Canonical YouTube SourceEnvelope -> tiny public title-route projection.
 * No video is authorized merely because it appears in a curated playlist or
 * TMDB watch-provider list. In absence of an approved verified source, zero
 * direct routes are published and all TMDB YouTube search fallbacks remain.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {buildYoutubeVerifiedRouteIndex} from '../src/providers/youtubeVerifiedRouteIndex.js'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export const VERIFIED_YOUTUBE_INPUT=resolve(root,'artifacts/youtube-verified-source-envelope.json')
export const VERIFIED_YOUTUBE_OUTPUT=resolve(root,'public/youtube-verified-title-routes.json')
export async function generateYoutubeVerifiedRouteIndex({
  input=VERIFIED_YOUTUBE_INPUT,output=VERIFIED_YOUTUBE_OUTPUT,
  now=new Date().toISOString(),
}={}){
  let envelope=null
  try{
    envelope=JSON.parse(await readFile(input,'utf8'))
  }catch(error){
    if(error?.code!=='ENOENT')throw error
  }
  const index=buildYoutubeVerifiedRouteIndex(envelope,{now})
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(index)+'\n','utf8')
  console.log(JSON.stringify({
    kind:index.kind,count:index.count,
    fallbackRetained:true,sourceVerifiedEnvelopePresent:Boolean(envelope),
    publicationPermitted:true,unverifiedCandidatesPublished:0,
  }))
  return index
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  generateYoutubeVerifiedRouteIndex().catch(e=>{
    console.error('Verified YouTube route publication blocked: '+e.message)
    process.exitCode=1
  })
}
