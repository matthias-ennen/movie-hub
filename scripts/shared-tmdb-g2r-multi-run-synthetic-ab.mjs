/**
 * MovieHub #336 G2r: FIVE separated simulated runs using ORIGINAL Waipu/Joyn
 * TMDB search clients against a deterministic fake fetcher (zero real HTTP).
 *
 * Exercises the existing versioned, 0600, single-writer response snapshot:
 * Day 0 seeds once, days 1/3/6 reload WITHOUT TTL refresh, day 7 expires.
 * No production adapters, external EPG, credentials, or Nightly involved.
 * Only fixed aggregate counters leave the temporary private workspace.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JoynTmdbSearchClient, matchJoynProgram } from './joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient, matchWaipuProgram } from './waipu-tmdb-matcher.mjs'
import {
  SharedTmdbResponseStore, saveOptionalSharedTmdbResponses,
  SHARED_TMDB_RESPONSE_STORE_TTL_MS,
} from './shared-tmdb-response-store.mjs'
import { createSharedTmdbSearchResponseCache } from './shared-tmdb-search-response-cache.mjs'
import { openG2nPrivateSharedTmdbRead } from './shared-tmdb-g2n-private-response-replay.mjs'

const DAY = 86_400_000
const DAYS = Object.freeze([0, 1, 3, 6, 7])
const SOURCE = Object.freeze([
  Object.freeze({ type:'movie', title:'G2R SYNTHETIC MOVIE ONLY', id:74831 }),
  Object.freeze({ type:'series', title:'G2R SYNTHETIC SERIES ONLY', id:74832 }),
])
const KEYS = [
  'kind','schemaVersion','mode','simulatedRuns','simulatedDayOffsets',
  'perRun','baselineOriginalClientStarts','sharedOriginalClientStarts',
  'simulatedStartsAvoided','sharedExactResponseHits',
  'expiredFallbackStarts','snapshotWrites','snapshotBytesUnchangedAfterSeed',
  'responseRowsEquivalent','originalMatcherDecisionsEquivalent',
  'liveTmdbHttpStarted','measuredProductionSavings','productiveWrites',
  'nightlyEnabled','publishApproved','playbackRoutesApproved',
]
const RUN_KEYS = [
  'dayOffset','baselineStarts','sharedStarts','sharedHits',
  'restoredExactResponses',
]
const exactShape = (value, fields) => value && typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...fields].sort().join('|')
const count = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const rowIds = rows => (Array.isArray(rows) ? rows : [])
  .map(row => [row?.type,row?.id,row?.title || row?.name])
const decisionShape = d => ({
  status:d?.status ?? null,reason:d?.reason ?? null,
  type:d?.status === 'matched' ? d.match?.type ?? null : null,
  tmdbId:d?.status === 'matched' ? d.match?.tmdbId ?? null : null,
})
const options = (fetchImpl, responseCache = null) => ({
  token:'OFFLINE_TEST_CREDENTIAL_NOT_REAL', fetchImpl, responseCache,
  language:'de-DE', maxRequests:2, maxRetries:0, paceMs:0,
})

/** Only fictional preselected query/title pairs; never call global fetch. */
function fakeFetcher(counter) {
  return async input => {
    const u = new URL(String(input))
    const source = SOURCE.find(row =>
      u.pathname === '/3/search/'+(row.type === 'movie' ? 'movie' : 'tv') &&
      u.searchParams.get('query') === row.title)
    if (!source || u.protocol !== 'https:' ||
        u.hostname !== 'api.themoviedb.org' ||
        [...u.searchParams.keys()].sort().join('|') !==
          'include_adult|language|query' ||
        u.searchParams.get('include_adult') !== 'false' ||
        u.searchParams.get('language') !== 'de-DE') {
      throw new TypeError('Out-of-scope mock query')
    }
    counter.calls++
    const result = source.type === 'movie'
      ? { id:source.id, title:source.title, release_date:'2020-01-01' }
      : { id:source.id, name:source.title, first_air_date:'2020-01-01' }
    return {
      ok:true,status:200,headers:new Headers(),
      json:async() => ({page:1,total_pages:1,results:[result]}),
      text:async() => '',
    }
  }
}

async function withClients({ now, baseline, file, seededJoynRows = null, counter }) {
  const outcomes = []
  let starts = 0
  let hits = 0
  let restored = null
  for (let i=0;i<SOURCE.length;i++) {
    const source=SOURCE[i]
    const input={type:source.type,title:source.title}
    let joynRows
    if (seededJoynRows) {
      // Day 0 Joyn responses were obtained by the original seeding clients.
      // Do not run a second synthetic Joyn client and inflate cache hits.
      joynRows=seededJoynRows[i]
      if (!Array.isArray(joynRows)) throw new TypeError('Missing original seed results')
    } else {
      let responseCache=null
      let replay=null
      if (!baseline) {
        replay=await openG2nPrivateSharedTmdbRead({
          file,now,sourceId:'joyn',enabled:true,
        })
        if (replay?.loadStatus !== 'loaded') {
          throw new TypeError('Separated Joyn replay unavailable')
        }
        responseCache=replay.responseCache
        restored=replay.summary().restoredExactSearchResponses
      }
      const joyn=new JoynTmdbSearchClient(options(fakeFetcher(counter),responseCache))
      joynRows=await joyn.search(input)
      starts+=joyn.requestsStarted
      if (replay) hits+=replay.summary().sharedResponseHits
    }

    let responseCache=null
    let replay=null
    if (!baseline) {
      replay=await openG2nPrivateSharedTmdbRead({
        file,now,sourceId:'waipu',enabled:true,
      })
      if (replay?.loadStatus !== 'loaded') {
        throw new TypeError('Separated Waipu replay unavailable')
      }
      responseCache=replay.responseCache
      restored=replay.summary().restoredExactSearchResponses
    }
    const waipu=new WaipuTmdbSearchClient(options(fakeFetcher(counter),responseCache))
    const waipuRows=await waipu.search(input)
    starts+=waipu.requestsStarted
    if (replay) hits+=replay.summary().sharedResponseHits
    outcomes.push({
      source, joynRows,waipuRows,
      joynMatch:await matchJoynProgram(input,{localCandidates:joynRows}),
      waipuMatch:await matchWaipuProgram(input,{
        localCandidates:waipuRows,now:()=>now,
      }),
    })
  }
  return {outcomes,starts,hits,restored}
}

export function isSafeG2rSyntheticMultiRunReport(value) {
  if (!exactShape(value,KEYS) ||
      value.kind !== 'g2r-synthetic-multi-run-original-client-cache-ab' ||
      value.schemaVersion !== 1 || value.mode !== 'offline-mocked-http' ||
      value.simulatedRuns !== DAYS.length ||
      !same(value.simulatedDayOffsets,DAYS) ||
      !Array.isArray(value.perRun) || value.perRun.length !== DAYS.length ||
      value.perRun.some((row,i) => !exactShape(row,RUN_KEYS) ||
        row.dayOffset !== DAYS[i] ||
        !count(row.baselineStarts,4) || row.baselineStarts !== 4 ||
        !count(row.sharedStarts,4) || !count(row.sharedHits,4) ||
        !count(row.restoredExactResponses,2) ||
        row.sharedStarts+row.sharedHits !== 4 ||
        row.restoredExactResponses !== 2*(i !== DAYS.length-1) ||
        row.sharedStarts !== (i === 0 ? 2 : i === DAYS.length-1 ? 4 : 0) ||
        row.sharedHits !== (i === 0 ? 2 : i === DAYS.length-1 ? 0 : 4)
      )) return false
  const sum=(name)=>value.perRun.reduce((n,r)=>n+r[name],0)
  return value.baselineOriginalClientStarts === sum('baselineStarts') &&
    value.sharedOriginalClientStarts === sum('sharedStarts') &&
    value.sharedExactResponseHits === sum('sharedHits') &&
    value.simulatedStartsAvoided ===
      value.baselineOriginalClientStarts-value.sharedOriginalClientStarts &&
    value.expiredFallbackStarts === value.perRun.at(-1).sharedStarts &&
    value.snapshotWrites === 1 &&
    value.snapshotBytesUnchangedAfterSeed === true &&
    value.responseRowsEquivalent === true &&
    value.originalMatcherDecisionsEquivalent === true &&
    value.liveTmdbHttpStarted === 0 &&
    value.measuredProductionSavings === null &&
    value.productiveWrites === 0 &&
    value.nightlyEnabled === false &&
    value.publishApproved === false &&
    value.playbackRoutesApproved === false &&
    JSON.stringify(value).length < 1200
}

/** Five mocked runs: real production clients, persistent file, no real HTTP. */
export async function runG2rSyntheticMultiRunAb({now=Date.now()}={}) {
  if (!Number.isFinite(now) || now <= 0 ||
      !Number.isFinite(now+SHARED_TMDB_RESPONSE_STORE_TTL_MS) ||
      !Number.isFinite(new Date(now+SHARED_TMDB_RESPONSE_STORE_TTL_MS).getTime())) {
    throw new TypeError('Invalid synthetic cache clock')
  }
  const directory=await mkdtemp(join(tmpdir(),'moviehub-g2r-'))
  const file=join(directory,'shared-tmdb-response-cache.json')
  try {
    const perRun=[]
    let baselineStarts=0
    let sharedStarts=0
    let hits=0
    let responseParity=true
    let decisionParity=true
    let snapshotBytes=null
    let unchanged=true
    for (const day of DAYS) {
      const clock=now+day*DAY
      const baselineCounter={calls:0}
      const base=await withClients({
        now:clock,baseline:true,counter:baselineCounter,
      })
      if (base.starts !== baselineCounter.calls ||
          base.starts !== 4) {
        throw new TypeError('Original baseline mock transport inconsistent')
      }
      const sharedCounter={calls:0}
      let seedJoynRows=null
      if (day === 0) {
        const seed=new SharedTmdbResponseStore({now:clock})
        seedJoynRows=[]
        // The original client writes into the private in-memory seed first.
        // Persist before distinct Waipu consumers reopen the saved snapshot.
        for (const source of SOURCE) {
          const j=new JoynTmdbSearchClient(options(
            fakeFetcher(sharedCounter),
            createSharedTmdbSearchResponseCache(seed),
          ))
          seedJoynRows.push(await j.search({type:source.type,title:source.title}))
          if (j.requestsStarted !== 1) {
            throw new TypeError('Original seed did not start one search')
          }
        }
        const saved=await saveOptionalSharedTmdbResponses(file,seed)
        if (saved.status !== 'saved' || saved.entries !== 2 ||
            ((await stat(file)).mode&0o777)!==0o600) {
          throw new TypeError('Private seed snapshot not safely persisted')
        }
        snapshotBytes=await readFile(file)
      }
      const result=await withClients({
        now:clock,baseline:false,file,counter:sharedCounter,
        seededJoynRows:seedJoynRows,
      })
      const sharedOnThisDay=sharedCounter.calls
      if (result.starts !== (day === 0 ? sharedOnThisDay-2 : sharedOnThisDay)) {
        // Day zero's two pre-seed Joyn HTTP starts are counted separately.
        throw new TypeError('Original shared mock transport inconsistent')
      }
      const daySharedStarts=day === 0 ? result.starts+2 : result.starts
      const dayHits=result.hits
      const entries=day === 7 ? 0 : 2
      if (result.restored !== entries) {
        throw new TypeError('Unexpected TTL or restored response count')
      }
      for (let i=0;i<SOURCE.length;i++) {
        const a=base.outcomes[i],b=result.outcomes[i]
        responseParity &&= same(rowIds(a.joynRows),rowIds(b.joynRows)) &&
          same(rowIds(a.waipuRows),rowIds(b.waipuRows)) &&
          a.joynRows.some(x=>x?.id===SOURCE[i].id) &&
          a.waipuRows.some(x=>x?.id===SOURCE[i].id)
        decisionParity &&= same(decisionShape(a.joynMatch),decisionShape(b.joynMatch)) &&
          same(decisionShape(a.waipuMatch),decisionShape(b.waipuMatch))
      }
      baselineStarts+=base.starts
      sharedStarts+=daySharedStarts
      hits+=dayHits
      unchanged &&= (await readFile(file)).equals(snapshotBytes)
      perRun.push({
        dayOffset:day,baselineStarts:base.starts,
        sharedStarts:daySharedStarts,sharedHits:dayHits,
        restoredExactResponses:result.restored,
      })
    }
    const report={
      kind:'g2r-synthetic-multi-run-original-client-cache-ab',
      schemaVersion:1,mode:'offline-mocked-http',
      simulatedRuns:DAYS.length,simulatedDayOffsets:[...DAYS],perRun,
      baselineOriginalClientStarts:baselineStarts,
      sharedOriginalClientStarts:sharedStarts,
      simulatedStartsAvoided:baselineStarts-sharedStarts,
      sharedExactResponseHits:hits,
      expiredFallbackStarts:perRun.at(-1).sharedStarts,
      snapshotWrites:1,snapshotBytesUnchangedAfterSeed:unchanged,
      responseRowsEquivalent:responseParity,
      originalMatcherDecisionsEquivalent:decisionParity,
      liveTmdbHttpStarted:0,measuredProductionSavings:null,
      productiveWrites:0,nightlyEnabled:false,
      publishApproved:false,playbackRoutesApproved:false,
    }
    if (!isSafeG2rSyntheticMultiRunReport(report)) {
      throw new TypeError('Unsafe synthetic multi-run report')
    }
    return report
  } finally {
    await rm(directory,{recursive:true,force:true})
  }
}
