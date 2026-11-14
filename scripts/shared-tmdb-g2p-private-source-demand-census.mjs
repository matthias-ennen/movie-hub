/**
 * MovieHub #336 / G2p: PRIVATE source-backed census of potential identical
 * TMDB search request keys across Waipu, Joyn and XMLTV, no TMDB HTTP.
 *
 * This is a demand inventory, NOT an HTTP log or proof of saved calls:
 * match caches and local catalogs may stop a candidate before any search;
 * original clients may retry/year-fallback or try additional Joyn aliases.
 *
 * Inputs remain entirely within a separately authenticated, ephemeral
 * Actions runner. Only a strict count-only aggregate leaves this process.
 */
import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  collectWaipuBroadcasts, readWaipuCacheRecords,
} from './waipu-live-catalog.mjs'
import {
  classifyWaipuProgram, normalizeWaipuProgram,
} from './waipu-program-classifier.mjs'
import { inferXmltvMediaType } from './xmltv-g1b-match-preview.mjs'
import { isSafeXmltvG2StagingReport } from './xmltv-g2-private-staging.mjs'
import { replayXmltvPrivateLkg } from '../src/sources/xmltv/xmltvPrivateLkgReplay.js'
import { sharedTmdbRequestPath } from './shared-tmdb-search-response-cache.mjs'
import { JoynLookupCache } from './joyn-match-cache.mjs'
import { trustedCachedJoynSearchType } from './epg-g1e-private-joyn-source-cache-coverage.mjs'
import { XMLTV_VERIFIED_SOURCE_FAMILIES } from '../src/sources/xmltv/xmltvSourceReadiness.js'

export const G2P_CONFIRMATION = 'PRIVATE_G2P_SOURCE_KEY_CENSUS_NO_TMDB'
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const MAX_SOURCE_RECORDS = 250_000
const MAX_SOURCE_KEYS = 45_000
const MAX_JOYN_WINDOWS = 56
const MAX_JSON_BYTES = 96 * 1024 * 1024
const MAX_TOTAL_JOYN_BYTES = 256 * 1024 * 1024
const MAX_JOYN_LOOKUP_BYTES = 600 * 1024 * 1024
const MAX_SOURCE_AGE_MS = 36 * 60 * 60 * 1000
// Diagnostic identifiers only: never include an OS error, filename, title,
// URL, request key, internal source object or a thrown stack in Actions logs.
const PRIVATE_ERROR_CODES = Object.freeze([
  'G2P_CHECKPOINT_STATUS_REJECTED',
  'G2P_WAIPU_HORIZON_REJECTED',
  'G2P_WAIPU_GRID_REJECTED',
  'G2P_WAIPU_STATIONS_REJECTED',
  'G2P_WAIPU_DETAILS_REJECTED',
  'G2P_JOYN_WINDOWS_REJECTED',
  'G2P_JOYN_LOOKUP_REJECTED',
  'G2P_XMLTV_GENERATIONS_REJECTED',
  'G2P_WAIPU_DEMAND_REJECTED',
  'G2P_JOYN_DEMAND_REJECTED',
  'G2P_XMLTV_DEMAND_REJECTED',
  'G2P_AGGREGATE_REJECTED',
])
const classified = async (code, work) => {
  if (!PRIVATE_ERROR_CODES.includes(code) || typeof work !== 'function') {
    throw new TypeError('Unsafe G2p checkpoint error category')
  }
  try { return await work() } catch (error) {
    if (PRIVATE_ERROR_CODES.includes(error?.message)) throw error
    throw new Error(code)
  }
}
export const safeG2pFailureCode = error =>
  PRIVATE_ERROR_CODES.includes(error?.message) ? error.message : 'G2P_UNCLASSIFIED_FAILURE'
const SOURCES = Object.keys(XMLTV_VERIFIED_SOURCE_FAMILIES)
const PAIRS = [['waipu','joyn'],['waipu','xmltv'],['joyn','xmltv']]
const KEYS = [
  'kind','schemaVersion','mode','waipuProgrammesInspected',
  'joynProgrammesInspected','xmltvProgrammesInspected',
  'joynLookupCacheAvailable','joynTrustedCachedTypeCandidates',
  'waipuTypedDemandCandidates','joynTypedDemandCandidates',
  'xmltvTypedDemandCandidates','waipuDistinctSearchKeys',
  'joynDistinctSearchKeys','xmltvDistinctSearchKeys',
  'waipuJoynOverlapKeys','waipuXmltvOverlapKeys',
  'joynXmltvOverlapKeys','allThreeOverlapKeys','unionDistinctSearchKeys',
  'potentialRepeatedKeysAcrossSources','xmltvFamiliesObserved',
  'validatedXmltvSources','realTmdbHttpStarted',
  'measuredAvoidedProductionRequests','untypedProgrammesExcluded',
  'originalMatcherDecisionsChanged','productiveWrites',
  'publishApproved','playbackRoutesApproved',
]
const integer = (n,max) => Number.isSafeInteger(n) && n >= 0 && n <= max
const normal = value => typeof value === 'string' &&
  value === value.trim() && value.length >= 1 &&
  value.length <= 255 && !/[\u0000-\u001f\u007f]/u.test(value)
const year = value => Number.isInteger(value) && value >= 1888 && value <= 2100
const isPlain = o => o !== null && typeof o === 'object' && !Array.isArray(o)
const iso = value => typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value
const uniqueCount = (a,b) => [...a].filter(key=>b.has(key)).length

/** Same literal /search/... keys and de-DE params as ORIGINAL Waipu client. */
export function g2pExactPotentialRequest({ title, type, productionYear = null } = {}) {
  if (!normal(title) || !['movie','series'].includes(type)) return null
  if (productionYear !== null && !year(productionYear)) return null
  const path = type === 'movie' ? '/search/movie' : '/search/tv'
  const params = { language:'de-DE', query:title, include_adult:'false' }
  if (type === 'movie' && year(productionYear)) {
    params.year = String(productionYear)
  }
  const key = JSON.stringify([path,params])
  return sharedTmdbRequestPath(key) ? key : null
}

/**
 * Use the exact horizon and grid projection from the original Waipu importer.
 * Historical cache slots must never inflate the current private EPG census.
 */
export function collectG2pWaipuCensusBroadcasts(gridRecords, stations, horizon) {
  if (!iso(horizon?.start) || !iso(horizon?.endExclusive) ||
      Date.parse(horizon.endExclusive) <= Date.parse(horizon.start)) {
    throw new Error('G2P_WAIPU_HORIZON_REJECTED')
  }
  return collectWaipuBroadcasts(gridRecords, {
    stations, startTime:horizon.start, endTimeExclusive:horizon.endExclusive,
  })
}

function waipuKeys(broadcasts, details) {
  if (!Array.isArray(broadcasts) || broadcasts.length > MAX_SOURCE_RECORDS ||
      !(details instanceof Map)) {
    throw new TypeError('Unbounded Waipu original source input')
  }
  const keys = new Set()
  let typed = 0
  let untyped = 0
  for (const entry of broadcasts) {
    const detail = details.get(entry?.programId) ?? null
    // collectWaipuBroadcasts returns gridGenre/programId, while the original
    // classifier expects genre/id. Preserve its actual input contract.
    const gridProgram = {
      id:entry?.programId, title:entry?.title, genre:entry?.gridGenre,
      episodeTitle:entry?.episodeTitle, seriesId:entry?.seriesId,
    }
    const classification = classifyWaipuProgram(gridProgram, detail)
    const normalized = normalizeWaipuProgram(gridProgram, detail, classification)
    const key = normalized && g2pExactPotentialRequest({
      title: normalized.title, type: normalized.type,
      productionYear: normalized.type === 'movie' &&
        year(normalized.productionYear) ? normalized.productionYear : null,
    })
    if (key) {
      typed++
      keys.add(key)
    } else untyped++
    if (keys.size > MAX_SOURCE_KEYS) throw new RangeError('Waipu key cap')
  }
  return { keys, inspected:broadcasts.length, typed, untyped }
}

/**
 * Joyn's V2 EPG records are generic EpgEntryV2. Use only the original
 * seven-day JoynLookupCache.get policy plus its strict original SearchQ
 * proof validator, never a guessed title/genre type or a TMDB identity.
 */
function joynKeys(items, lookupCache = null) {
  if (!Array.isArray(items) || items.length > MAX_SOURCE_RECORDS ||
      (lookupCache !== null && !(lookupCache instanceof JoynLookupCache))) {
    throw new TypeError('Unbounded or unverified Joyn source input')
  }
  const keys = new Set()
  let typed = 0
  let untyped = 0
  let trustedCacheTypeCandidates = 0
  for (const item of items) {
    const p = item?.program
    const title = String(p?.title ?? '').trim()
    const explicitType = p?.__typename === 'Movie' ? 'movie' :
      ['Series','Episode'].includes(p?.__typename) ? 'series' : null
    const generic = ['EpgEntry','EpgEntryV2'].includes(p?.__typename)
    const proof = generic && lookupCache
      ? lookupCache.get('joyn-title-v1', title) : null
    const trustedType = proof ? trustedCachedJoynSearchType(proof, title) : null
    const type = explicitType || trustedType
    const key = type && g2pExactPotentialRequest({ title, type })
    if (key) {
      typed++
      keys.add(key)
      if (!explicitType && trustedType) trustedCacheTypeCandidates++
    } else untyped++
    if (keys.size > MAX_SOURCE_KEYS) throw new RangeError('Joyn key cap')
  }
  return { keys, inspected:items.length, typed, untyped,
    trustedCacheTypeCandidates }
}

/**
 * Only G2d-provenance-verified original source snapshots are accepted.
 * FreeEPG and IPTV-EPG.org remain ONE content family, not independent peers.
 */
function xmltvKeys(generations, { now }) {
  if (!Array.isArray(generations) || generations.length > SOURCES.length ||
      !Number.isFinite(now)) throw new TypeError('Invalid private XMLTV source set')
  const seen = new Set()
  const keys = new Set()
  const families = new Set()
  let inspected = 0
  let typed = 0
  let untyped = 0
  let validSources = 0
  for (const generation of generations) {
    const id = generation?.sourceId
    if (!SOURCES.includes(id) || seen.has(id)) {
      throw new TypeError('Unreviewed XMLTV source generation')
    }
    seen.add(id)
    const verified = replayXmltvPrivateLkg([
      { sourceId:id, current:generation, lastKnownGood:null },
    ], { now })
    if (verified?.sources?.[0]?.currentStations < 1) {
      throw new TypeError('Original XMLTV generation not validated by G2d')
    }
    validSources++
    families.add(XMLTV_VERIFIED_SOURCE_FAMILIES[id])
    for (const row of generation.records) {
      inspected++
      const type = inferXmltvMediaType(row)
      const key = type && row?.stationMappingStatus === 'mapped' &&
        row?.timestampsExplicitlyZoned === true &&
        g2pExactPotentialRequest({
          title: String(row.title || '').trim(), type,
          productionYear: type === 'movie' &&
            year(row.productionYearEvidence) ?
            row.productionYearEvidence : null,
        })
      if (key) {
        typed++
        keys.add(key)
      } else untyped++
      if (keys.size > MAX_SOURCE_KEYS || inspected > MAX_SOURCE_RECORDS) {
        throw new RangeError('XMLTV key/record cap')
      }
    }
  }
  return {keys,inspected,typed,untyped,families:families.size,validSources}
}

/** All source strings/keys remain in memory; export ONLY anonymized counts. */
export function computeG2pPrivateOverlap({
  waipuBroadcasts, waipuDetails, joynItems, xmltvGenerations,
  joynLookupCache = null,
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid overlap clock')
  // Categories are static and independent of the private programme content.
  // Preserve the root fault DOMAIN without ever exposing raw exception text.
  let a,b,c
  try { a=waipuKeys(waipuBroadcasts,waipuDetails) }
  catch { throw new Error('G2P_WAIPU_DEMAND_REJECTED') }
  try { b=joynKeys(joynItems,joynLookupCache) }
  catch { throw new Error('G2P_JOYN_DEMAND_REJECTED') }
  try { c=xmltvKeys(xmltvGenerations,{now}) }
  catch { throw new Error('G2P_XMLTV_DEMAND_REJECTED') }
  const sizes=[a.keys.size,b.keys.size,c.keys.size]
  const union=new Set([...a.keys,...b.keys,...c.keys])
  const repeated=sizes.reduce((x,y)=>x+y,0)-union.size
  const allThree=[...a.keys].filter(k=>b.keys.has(k)&&c.keys.has(k)).length
  const report={
    kind:'g2p-private-original-source-potential-query-overlap',
    schemaVersion:1,
    mode:'source-backed-query-demand-not-http',
    waipuProgrammesInspected:a.inspected,
    joynProgrammesInspected:b.inspected,
    joynLookupCacheAvailable:joynLookupCache !== null,
    joynTrustedCachedTypeCandidates:b.trustedCacheTypeCandidates,
    xmltvProgrammesInspected:c.inspected,
    waipuTypedDemandCandidates:a.typed,
    joynTypedDemandCandidates:b.typed,
    xmltvTypedDemandCandidates:c.typed,
    waipuDistinctSearchKeys:sizes[0],
    joynDistinctSearchKeys:sizes[1],
    xmltvDistinctSearchKeys:sizes[2],
    waipuJoynOverlapKeys:uniqueCount(a.keys,b.keys),
    waipuXmltvOverlapKeys:uniqueCount(a.keys,c.keys),
    joynXmltvOverlapKeys:uniqueCount(b.keys,c.keys),
    allThreeOverlapKeys:allThree,
    unionDistinctSearchKeys:union.size,
    potentialRepeatedKeysAcrossSources:repeated,
    xmltvFamiliesObserved:c.families,
    validatedXmltvSources:c.validSources,
    realTmdbHttpStarted:0,
    measuredAvoidedProductionRequests:null,
    untypedProgrammesExcluded:a.untyped+b.untyped+c.untyped,
    originalMatcherDecisionsChanged:false,
    productiveWrites:0,
    publishApproved:false,
    playbackRoutesApproved:false,
  }
  if (!isSafeG2pOverlapAggregate(report)) {
    throw new TypeError('Unsafe private source overlap report')
  }
  return report
}

export function isSafeG2pOverlapAggregate(x) {
  if (!isPlain(x) ||
      Object.keys(x).sort().join('|')!==[...KEYS].sort().join('|') ||
      x.kind!=='g2p-private-original-source-potential-query-overlap' ||
      x.schemaVersion!==1 ||
      x.mode!=='source-backed-query-demand-not-http' ||
      !integer(x.waipuProgrammesInspected,MAX_SOURCE_RECORDS) ||
      !integer(x.joynProgrammesInspected,MAX_SOURCE_RECORDS) ||
      typeof x.joynLookupCacheAvailable !== 'boolean' ||
      !integer(x.joynTrustedCachedTypeCandidates,MAX_SOURCE_RECORDS) ||
      x.joynTrustedCachedTypeCandidates>x.joynTypedDemandCandidates ||
      (!x.joynLookupCacheAvailable && x.joynTrustedCachedTypeCandidates!==0) ||
      !integer(x.xmltvProgrammesInspected,MAX_SOURCE_RECORDS) ||
      !integer(x.waipuTypedDemandCandidates,MAX_SOURCE_RECORDS) ||
      !integer(x.joynTypedDemandCandidates,MAX_SOURCE_RECORDS) ||
      !integer(x.xmltvTypedDemandCandidates,MAX_SOURCE_RECORDS) ||
      !integer(x.waipuDistinctSearchKeys,MAX_SOURCE_KEYS) ||
      !integer(x.joynDistinctSearchKeys,MAX_SOURCE_KEYS) ||
      !integer(x.xmltvDistinctSearchKeys,MAX_SOURCE_KEYS) ||
      !integer(x.waipuJoynOverlapKeys,MAX_SOURCE_KEYS) ||
      !integer(x.waipuXmltvOverlapKeys,MAX_SOURCE_KEYS) ||
      !integer(x.joynXmltvOverlapKeys,MAX_SOURCE_KEYS) ||
      !integer(x.allThreeOverlapKeys,MAX_SOURCE_KEYS) ||
      !integer(x.unionDistinctSearchKeys,3*MAX_SOURCE_KEYS) ||
      !integer(x.potentialRepeatedKeysAcrossSources,2*MAX_SOURCE_KEYS) ||
      !integer(x.untypedProgrammesExcluded,3*MAX_SOURCE_RECORDS) ||
      !integer(x.xmltvFamiliesObserved,2) ||
      !integer(x.validatedXmltvSources,SOURCES.length) ||
      x.waipuTypedDemandCandidates>x.waipuProgrammesInspected ||
      x.joynTypedDemandCandidates>x.joynProgrammesInspected ||
      x.xmltvTypedDemandCandidates>x.xmltvProgrammesInspected ||
      x.waipuDistinctSearchKeys>x.waipuTypedDemandCandidates ||
      x.joynDistinctSearchKeys>x.joynTypedDemandCandidates ||
      x.xmltvDistinctSearchKeys>x.xmltvTypedDemandCandidates ||
      x.waipuJoynOverlapKeys>Math.min(x.waipuDistinctSearchKeys,x.joynDistinctSearchKeys) ||
      x.waipuXmltvOverlapKeys>Math.min(x.waipuDistinctSearchKeys,x.xmltvDistinctSearchKeys) ||
      x.joynXmltvOverlapKeys>Math.min(x.joynDistinctSearchKeys,x.xmltvDistinctSearchKeys) ||
      x.allThreeOverlapKeys>Math.min(
        x.waipuJoynOverlapKeys,x.waipuXmltvOverlapKeys,x.joynXmltvOverlapKeys,
      ) ||
      x.unionDistinctSearchKeys !==
        x.waipuDistinctSearchKeys+x.joynDistinctSearchKeys+
        x.xmltvDistinctSearchKeys-x.waipuJoynOverlapKeys-
        x.waipuXmltvOverlapKeys-x.joynXmltvOverlapKeys+
        x.allThreeOverlapKeys ||
      x.potentialRepeatedKeysAcrossSources!==
        x.waipuDistinctSearchKeys+x.joynDistinctSearchKeys+
        x.xmltvDistinctSearchKeys-x.unionDistinctSearchKeys ||
      x.untypedProgrammesExcluded!==
        x.waipuProgrammesInspected+x.joynProgrammesInspected+
        x.xmltvProgrammesInspected-x.waipuTypedDemandCandidates-
        x.joynTypedDemandCandidates-x.xmltvTypedDemandCandidates ||
      x.realTmdbHttpStarted!==0 ||
      x.measuredAvoidedProductionRequests!==null ||
      x.originalMatcherDecisionsChanged!==false ||
      x.productiveWrites!==0 ||
      x.publishApproved!==false || x.playbackRoutesApproved!==false ||
      JSON.stringify(x).length>=1300) return false
  return true
}

async function safeJson(filename,limit=MAX_JSON_BYTES) {
  const info=await lstat(filename)
  if (!info.isFile() || info.isSymbolicLink() ||
      info.size<1 || info.size>limit) {
    throw new TypeError('Private source checkpoint file unavailable')
  }
  return JSON.parse(await readFile(filename,'utf8'))
}

async function requireSourceStatus(path,sourceId,now) {
  const s=await safeJson(path,1024*1024)
  const at=Date.parse(s?.generatedAt)
  if (s?.kind!==sourceId+'-sync-status' || s.schemaVersion!==1 ||
      s.status!=='complete' || !iso(s.generatedAt) ||
      at>now || now-at>MAX_SOURCE_AGE_MS) {
    throw new TypeError('Private EPG source generation incomplete or stale')
  }
  return s
}

/**
 * Optional restored ORIGINAL lookup cache; a missing cache provides no proof.
 * A corrupt/oversized cache is a closed failure, not fabricated type evidence.
 * JoynLookupCache.get enforces its production 7-day TTL on every candidate.
 */
async function restoreOriginalJoynLookupCache(root, now) {
  const filename=join(root,'artifacts/joyn-live/lookup-cache.json')
  let info
  try { info=await lstat(filename) }
  catch(error) {
    if (error?.code==='ENOENT') return null
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink() ||
      info.size<1 || info.size>MAX_JOYN_LOOKUP_BYTES) {
    throw new TypeError('Untrusted original Joyn lookup file')
  }
  const cache=await JoynLookupCache.load(filename,now)
  if (!isPlain(cache.entries) ||
      Object.keys(cache.entries).length>MAX_SOURCE_RECORDS) {
    throw new TypeError('Unbounded original Joyn lookup cache')
  }
  return cache
}

async function restoreOriginalJoynWindows(root) {
  const checkpoint=await safeJson(join(root,'artifacts/joyn-sync/checkpoint.json'),4*1024*1024)
  if (checkpoint?.kind!=='joyn-sync-checkpoint' ||
      checkpoint.schemaVersion!==1 || !isPlain(checkpoint.windows)) {
    throw new TypeError('Invalid original Joyn source manifest')
  }
  const keys=Object.keys(checkpoint.windows)
  if (!keys.length || keys.length>MAX_JOYN_WINDOWS) {
    throw new TypeError('Invalid original Joyn window count')
  }
  const seen=new Set()
  const items=[]
  let bytes=0
  for (const key of keys) {
    if (!/^\d{13}_\d{13}$/.test(key)) {
      throw new TypeError('Invalid original Joyn cache window ID')
    }
    const manifest=checkpoint.windows[key]
    const filename=join(root,'artifacts/joyn-sync/cache',key+'.json')
    const meta=await lstat(filename)
    bytes+=meta.size
    if (bytes>MAX_TOTAL_JOYN_BYTES) throw new RangeError('Joyn original source bytes limit')
    const raw=await safeJson(filename,MAX_JSON_BYTES)
    if (!Array.isArray(raw?.items) ||
        raw.items.length!==manifest.count ||
        raw.fetchedAt!==manifest.fetchedAt ||
        String(raw.from)+'_'+String(raw.to)!==key) {
      throw new TypeError('Original Joyn window receipt disagreement')
    }
    for (const item of raw.items) {
      const id=String(item?.livestream?.id||'')+'|'+
        String(item?.program?.id||'')+'|'+
        String(item?.start||'')+'|'+String(item?.end||'')
      if (seen.has(id)) continue
      seen.add(id)
      items.push(item)
      if (items.length>MAX_SOURCE_RECORDS) {
        throw new RangeError('Joyn original programme cap')
      }
    }
  }
  return items
}

async function readXmltvSourceGenerations(root,now) {
  const report=await safeJson(join(root,'artifacts/xmltv-g2/report.json'),8192)
  if (!isSafeXmltvG2StagingReport(report) ||
      now-Date.parse(report.observedAt)>MAX_SOURCE_AGE_MS ||
      Date.parse(report.observedAt)>now) {
    throw new TypeError('XMLTV original staging receipt missing or stale')
  }
  const generations=[]
  for (const source of report.sources) {
    if (source.status!=='staged') continue
    const snapshot=await safeJson(
      join(root,'artifacts/xmltv-g2/private',source.sourceId+'.json'),
      MAX_JSON_BYTES,
    )
    if (snapshot.sourceId!==source.sourceId ||
        snapshot.stagedProgrammes!==source.stagedProgrammes ||
        snapshot.observedAt!==report.observedAt) {
      throw new TypeError('Untrusted original XMLTV source receipt')
    }
    generations.push(snapshot)
  }
  if (!generations.length) throw new TypeError('No valid XMLTV sources')
  return generations
}

/** Read only restored, privately verified original source records. */
export async function runG2pPrivateOriginalSourceCensus({
  root=ROOT, now=Date.now(),
}={}) {
  if (!Number.isFinite(now) || typeof root!=='string' || !root.trim()) {
    throw new TypeError('Invalid G2p original source context')
  }
  const [waipuStatus] = await classified('G2P_CHECKPOINT_STATUS_REJECTED',
    () => Promise.all([
      requireSourceStatus(join(root,'artifacts/waipu-sync/status.json'),'waipu',now),
      requireSourceStatus(join(root,'artifacts/joyn-sync/status.json'),'joyn',now),
    ]))
  const cacheRoot=join(root,'artifacts/waipu-sync/cache')
  const [grid,stations,details,joynItems,xmltvGenerations]=await Promise.all([
    classified('G2P_WAIPU_GRID_REJECTED',
      () => readWaipuCacheRecords(cacheRoot,'grid')),
    classified('G2P_WAIPU_STATIONS_REJECTED',
      () => readWaipuCacheRecords(cacheRoot,'stations')),
    classified('G2P_WAIPU_DETAILS_REJECTED',
      () => readWaipuCacheRecords(cacheRoot,'program')),
    classified('G2P_JOYN_WINDOWS_REJECTED',
      () => restoreOriginalJoynWindows(root)),
    classified('G2P_XMLTV_GENERATIONS_REJECTED',
      () => readXmltvSourceGenerations(root,now)),
  ])
  // Read the already restored original source-type receipts only AFTER source
  // loading. This is a separate bounded private read, not a provider request.
  const joynLookupCache=await classified('G2P_JOYN_LOOKUP_REJECTED',
    () => restoreOriginalJoynLookupCache(root,now))
  const stationIds=new Set((waipuStatus.stations||[]).map(row=>row?.id).filter(Boolean))
  const allowed=(stations[0]?.value||[]).filter(row=>stationIds.has(row?.id))
  if (!allowed.length || !grid.length || !details.length || !joynItems.length) {
    throw new Error('G2P_AGGREGATE_REJECTED')
  }
  return classified('G2P_AGGREGATE_REJECTED', async () => {
    const broadcasts=collectG2pWaipuCensusBroadcasts(grid,allowed,waipuStatus.horizon)
    return computeG2pPrivateOverlap({
      waipuBroadcasts:broadcasts,
      waipuDetails:new Map(details.map(row=>[row.key,row.value])),
      joynItems,xmltvGenerations,joynLookupCache,now,
    })
  })
}

async function main() {
  if (process.argv.length!==2 ||
      process.env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
      process.env.GITHUB_REF!=='refs/heads/main' ||
      process.env.G2P_CONFIRMATION!==G2P_CONFIRMATION) {
    throw new TypeError('G2p source census requires exact manual private approval')
  }
  const report=await runG2pPrivateOriginalSourceCensus()
  process.stdout.write(JSON.stringify(report)+'\n')
}
if (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  main().catch(error=>{
    console.error('G2p private census failed closed; category='+
      safeG2pFailureCode(error))
    process.exitCode=1
  })
}
