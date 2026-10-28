/**
 * YouTube #388: opt-in search transport for a FUTURE, approved shared budget.
 *
 * This adapter is deliberately not imported by any production job. Existing
 * live nightly/one/five-search workflows keep their independent conservative
 * GCS v1 admission (10/1 per PT day). Do not switch until ALL search callers
 * are migrated and actual Google quota/external use has been independently
 * reviewed. Never run two independent day ledgers in parallel.
 *
 * The wrapper alone owns the transport callback. It reserves ONE shared
 * Pacific-day search slot before each search.list, and does not retry API
 * requests, pagination or uncertain outcomes. Video lookups do not consume
 * a search slot. Project-wide Google quota remaining is never inferred.
 */
import {youtubeGet} from './youtube-api-smoke.mjs'
import {
  executeSharedBudgetedSearch,TARGET_SEARCH_CAP,
} from './youtube-g2-shared-search-gateway.mjs'

const READ_ENDPOINTS=new Set(['videos','channels','playlists',
  'playlistItems','videoCategories'])
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)

/**
 * Future migration surface for runNightlyDiscovery/runTmdbFirstLinkPilot.
 * The returned API callback has the existing signature: (endpoint, params).
 *
 * A distinct GitHub runId and monotonically increasing attemptNumber are
 * required so concurrent callers cannot reuse a reservation. Rejected,
 * crashed, rate-limited or quota-exhausted attempts remain conservatively
 * accounted. There is intentionally no public raw-transport getter.
 */
export function createSharedSearchYoutubeApi({
  bucket,admission,runId,apiKey,
  transport=youtubeGet,now=()=>new Date().toISOString(),
}={}){
  if(!Number.isSafeInteger(runId)||runId<=0
    ||typeof apiKey!=='string'||apiKey.length===0
    ||typeof transport!=='function'||typeof now!=='function'
    ||bucket?.name!=='movie-hub-62459-nightly-checkpoints'
    ||typeof bucket.file!=='function')
    throw Error('YOUTUBE_SHARED_SEARCH_TRANSPORT_NOT_CONFIGURED')

  let attempted=0
  return async function sharedYoutubeApi(endpoint,params){
    if(typeof endpoint!=='string'||!isRecord(params))
      throw Error('YOUTUBE_SHARED_SEARCH_API_REQUEST_INVALID')
    if(endpoint!=='search'){
      if(!READ_ENDPOINTS.has(endpoint))
        throw Error('YOUTUBE_SHARED_SEARCH_ENDPOINT_FORBIDDEN')
      return transport(endpoint,params,apiKey)
    }
    // A bad search request must not burn a daily slot or reach the network.
    if(params.part!=='snippet'||params.type!=='video'
      ||(params.videoType!==undefined&&params.videoType!=='movie'))
      throw Error('YOUTUBE_SHARED_SEARCH_QUERY_NOT_ALLOWED')
    if(attempted>=TARGET_SEARCH_CAP)
      throw Error('YOUTUBE_SHARED_SEARCH_RUN_HARD_CAP')
    const attemptNumber=++attempted
    return executeSharedBudgetedSearch({
      bucket,admission,runId,attemptNumber,now,
      search:()=>transport('search',params,apiKey),
    })
  }
}
