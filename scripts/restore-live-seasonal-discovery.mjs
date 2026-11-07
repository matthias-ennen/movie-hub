// Restore the previously published bounded discovery snapshot before a nightly
// refresh or code-only deploy. Absence is allowed ONLY for the first bootstrap
// before MovieHub has ever published thematic row definitions.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  SEASONAL_DISCOVERY_FILE, validateSeasonalDiscovery,
} from './tmdb-seasonal-discovery.mjs'

const ORIGIN='https://movie-hub-62459.web.app'
export async function restoreLiveSeasonalDiscovery({
  request=fetch, origin=process.env.MOVIE_HUB_LIVE_URL||ORIGIN,
  path=resolve(SEASONAL_DISCOVERY_FILE), catalogPath=resolve('public/catalog.json'),
}={}){
  const url=new URL('/seasonal-discovery.json',origin)
  url.searchParams.set('generation',String(Date.now()))
  const response=await request(url,{
    headers:{Accept:'application/json'},cache:'no-store',redirect:'error',
    signal:AbortSignal.timeout(20000),
  })
  const responseType=String(response?.headers?.get?.('content-type')||'').toLowerCase()
  // Firebase Hosting's SPA rewrite may serve index.html with HTTP 200 when
  // this new public file has never existed. Treat it as a bootstrap ONLY if
  // the last published canonical catalog has no thematic/quality rows.
  const absentSource=response?.status===404
    || (response?.ok===true && responseType.includes('text/html'))
  if(absentSource){
    let hadThematicRows=false
    try{
      const catalog=JSON.parse(await readFile(catalogPath,'utf8'))
      hadThematicRows=Array.isArray(catalog?.rowDefinitions)&&catalog.rowDefinitions.some(
        row=>row?.seasonId||row?.discoveryKind==='quality',
      )
    }catch{}
    if(hadThematicRows)throw Error('SEASONAL_SNAPSHOT_MISSING_FOR_PUBLISHED_THEME_ROWS')
    console.log('Seasonal discovery: first-generation bootstrap; no published snapshot yet.')
    return null
  }
  if(!response?.ok || !responseType.includes('application/json'))
    throw Error('SEASONAL_SNAPSHOT_FETCH_FAILED_CLOSED')
  const data=await response.json()
  if(!validateSeasonalDiscovery(data))throw Error('SEASONAL_SNAPSHOT_INVALID')
  await writeFile(path,JSON.stringify(data)+'\n','utf8')
  console.log(`Seasonal discovery restored: ${data.uniqueCandidates} candidates, generated ${data.generatedAt}`)
  return data
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  restoreLiveSeasonalDiscovery().catch(e=>{console.error(e.message);process.exitCode=1})
}
