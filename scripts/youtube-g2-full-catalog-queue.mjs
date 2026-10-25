import {createHash} from 'node:crypto'
import {validateKnownCandidateMap} from './youtube-g2-known-candidate-reuse.mjs'

/**
 * Reconcile the EXISTING complete canonical title inventory with the published
 * YouTube badges, then schedule strictly bounded TMDB-first YouTube research.
 *
 * Complete inventory: browse + personal TMDB + profile state + shared MovieHub
 * media + Waipu + Joyn, using the established #256 inventory builder.
 *
 * The PUBLIC search index only identifies its OWN exact youtube badges. Do not
 * infer YouTube provider membership or absence for profile-only/private titles.
 * No video IDs, real player links, verified offers, imports or catalog writes.
 */
export const YOUTUBE_FULL_CATALOG_PLAN = 'YOUTUBE_G2_CANONICAL_INVENTORY_AND_PUBLIC_BADGE_QUEUE_READ_ONLY'
export const YOUTUBE_RESEARCH_MAX_TITLES = 25
export const YOUTUBE_RESEARCH_DEFAULT_TITLES = 15
export const YOUTUBE_SEARCHES_PER_TITLE = 2
// Official YouTube Data API quota rules, updated 2026-10-15:
 // https://developers.google.com/youtube/data/determine_quota_cost
 // search.list has a dedicated default 100-CALL daily bucket, each call costs
 // one unit in that bucket. Never treat this default as this project's measured
 // remaining quota; all research also shares the key with other workflows.
export const YOUTUBE_SEARCH_QUOTA_UNITS = 1
export const YOUTUBE_SEARCH_DEFAULT_DAILY_CALL_LIMIT = 100
export const YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA = YOUTUBE_RESEARCH_MAX_TITLES
  * YOUTUBE_SEARCHES_PER_TITLE * YOUTUBE_SEARCH_QUOTA_UNITS
const REQUIRED_SOURCES = Object.freeze(['browse', 'personal-tmdb', 'profile-state', 'movie-hub', 'waipu', 'joyn'])
const SOURCES = Object.freeze([...REQUIRED_SOURCES, 'youtube'])
const OFFERS = new Set(['free', 'ads', 'flatrate', 'rent', 'buy'])
const validId = x => Number.isInteger(Number(x)) && Number(x) > 0 ? Number(x) : null
const safe = x => String(x ?? '').replace(/[<>\r\n|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
const titleKey = x => x?.type === 'movie' || x?.type === 'series'
  ? validId(x.tmdbId) ? x.type + ':' + Number(x.tmdbId) : null : null

function validate(inventory, publicIndex) {
  if (inventory?.kind !== 'title-candidate-inventory'
    || inventory?.schemaVersion !== 2 || inventory.identity !== 'media-type+tmdb-id'
    || !Array.isArray(inventory.candidates) || !inventory.candidates.length
    || inventory?.counts?.canonicalCandidates !== inventory.candidates.length
    || !REQUIRED_SOURCES.every(x => inventory?.sourceStats && Object.hasOwn(inventory.sourceStats,x))
    || !REQUIRED_SOURCES.every(x => inventory?.policy?.candidateSources?.includes(x))
    || inventory.candidates.some(x =>
      !titleKey(x) || x.key !== titleKey(x)
      || !Array.isArray(x.sources) || !x.sources.length
      || x.sources.some(source => !SOURCES.includes(source)))
    || new Set(inventory.candidates.map(x => x.key)).size !== inventory.candidates.length) {
    throw new Error('G2_FULL_CANONICAL_INVENTORY_REQUIRED')
  }
  if (publicIndex?.kind !== 'search-index' || publicIndex?.version !== 1
    || publicIndex.country !== 'DE' || publicIndex.source === 'fallback'
    || !Array.isArray(publicIndex.entries)
    || publicIndex.count !== publicIndex.entries.length || !publicIndex.entries.length) {
    throw new Error('G2_CURRENT_PUBLIC_DE_SEARCH_INDEX_REQUIRED')
  }
  for (const [label, observed] of [
    ['INVENTORY',inventory.generatedAt],
    ['PUBLIC_INDEX',publicIndex.generatedAt],
  ]) {
    if (!Number.isFinite(Date.parse(observed))) throw new Error('G2_' + label + '_TIMESTAMP_INVALID')
  }
}
function exactPublicYoutubeBadge(entry) {
  return (Array.isArray(entry?.providerIds) && entry.providerIds.includes('youtube'))
    || (Array.isArray(entry?.providerOffers)
      && entry.providerOffers.some(o => o?.id === 'youtube'))
}
function publicYoutubeOfferHints(entry) {
  return [...new Set((Array.isArray(entry?.providerOffers) ? entry.providerOffers : [])
    .filter(o => o?.id === 'youtube')
    .flatMap(o => Array.isArray(o.offerTypes) ? o.offerTypes : [])
    .filter(t => OFFERS.has(t)))]
}
export function createYoutubeFullCatalogResearchPlan({
  inventory, publicIndex,
  offset = 0, limit = YOUTUBE_RESEARCH_DEFAULT_TITLES,
  now = new Date().toISOString(),continuation = null,
  knownVideoCandidatesByTmdbId = null,
  // Existing historical 2-query QA remains default. The new bounded
  // first-pass admission explicitly selects ONE query, not both.
  searchesPerTitle = YOUTUBE_SEARCHES_PER_TITLE,
} = {}) {
  if(searchesPerTitle!==1&&searchesPerTitle!==2)
    throw Error('G2_RESEARCH_INVALID_SEARCH_STRATEGY')
  const knownMap=validateKnownCandidateMap(knownVideoCandidatesByTmdbId)
  validate(inventory, publicIndex)
  const asOf = new Date(now).toISOString()
  for (const [label, timestamp, maxMs] of [
    ['INVENTORY',inventory.generatedAt,7*86400000],
    ['PUBLIC_INDEX',publicIndex.generatedAt,30*86400000],
  ]) {
    const lag = Date.parse(asOf) - Date.parse(timestamp)
    if (!Number.isFinite(lag) || lag < -86400000 || lag > maxMs) {
      throw new Error('G2_' + label + '_STALE_OR_FUTURE')
    }
  }
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit)
    || limit < 1 || limit > YOUTUBE_RESEARCH_MAX_TITLES) {
    throw new Error('G2_YOUTUBE_RESEARCH_CURSOR_OR_BUDGET_INVALID')
  }

  const canonical = new Map(inventory.candidates.map(x => [x.key,x]))
  const indexed = new Map()
  for (const entry of publicIndex.entries) {
    const key = titleKey(entry)
    if (!key) continue
    const old = indexed.get(key)
    // Duplicate search-index entries cannot erase an exact YouTube badge.
    if (!old || (!exactPublicYoutubeBadge(old) && exactPublicYoutubeBadge(entry))) {
      indexed.set(key,entry)
    }
  }
  const publicYoutubeBadgedSeries = [...indexed.values()]
    .filter(entry => entry.type === 'series' && exactPublicYoutubeBadge(entry)).length
  // This pilot is FILM-only. Series need verified episode/season identity and
  // cannot safely borrow a movie playback route.
  const badged = [...indexed.entries()]
    .filter(([,entry]) => entry.type === 'movie' && exactPublicYoutubeBadge(entry))
    .map(([key,entry]) => {
      const member = canonical.get(key)
      return {
        key,mediaType:entry.type,tmdbId:Number(entry.tmdbId),
        title:safe(entry.title),originalTitle:safe(entry.originalTitle) || null,
        year:Number.isInteger(Number(entry.year)) ? Number(entry.year) : null,
        exactPublicYoutubeBadge:true,
        offerTypesFromPublishedTmdbSnapshot:publicYoutubeOfferHints(entry),
        catalogMembership:member ? 'canonical-and-public' : 'public-search-only',
        // Source IDs only, NEVER user/profile document paths.
        canonicalSourceKinds:member ? [...member.sources] : [],
        confirmedVideoId:null, independentlyVerifiedDeOffer:false,
        playbackRoute:null,publicationPermitted:false,
      }
    })
    .sort((a,b)=>a.key.localeCompare(b.key))
  const catalogBadged = badged.filter(x=>x.catalogMembership==='canonical-and-public')
  const publicOnly = badged.filter(x=>x.catalogMembership==='public-search-only')
  // Prioritize the complete canonical inventory: these films are already
  // relevant to MovieHub's current browse/profile/shared-media/TV universe.
  const pending = [...catalogBadged,...publicOnly]
  const queueIdentity = createHash('sha256').update(JSON.stringify(
    pending.map(x=>x.key))).digest('hex')
  // Never let a second manual run silently repeat offset 0 or jump ahead:
  // a resumed run must be chained to a previous, completed, immutable
  // private Actions QA. The caller verifies the GitHub artifact provenance.
  if (continuation === null && offset !== 0)
    throw Error('G2_RESEARCH_NONZERO_CURSOR_REQUIRES_PRIOR_QA')
  if (continuation !== null) {
    const previous = continuation
    const p=previous?.plan
    if (p?.mode!==YOUTUBE_FULL_CATALOG_PLAN
      ||p.publicationPermitted!==false||p.verifiedDEOffers!==0
      ||p.confirmedDirectLinks!==0
      ||['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
        .some(field=>p[field]!==0)
      ||!Array.isArray(p.plan)||p.plan.length!==p.batch?.selectedCount
      ||!Number.isInteger(p.batch?.offset)
      ||!Number.isInteger(p.batch?.selectedCount)
      ||p.batch.selectedCount<1
      ||p.batch.nextOffset===null
      ||p.batch.nextOffset!==offset
      ||p.batch.total!==pending.length
      ||p.batch.queueIdentity!==queueIdentity
      ||p.plan.some((x,i)=>x?.key!==pending[p.batch.offset+i]?.key
        ||x?.confirmedVideoId!==null||x?.playbackRoute!==null
        ||x?.publicationPermitted!==false)
      ||previous?.pilot?.summary?.publicationPermitted!==false
      ||previous.pilot.summary.verifiedDirectLinks!==0
      ||previous.pilot.summary.processedMovies!==p.batch.selectedCount
      ||previous.pilot.summary.calls?.youtubeSearches>
          p.batch.youtubeSearchCallsPlanned
      ||previous.pilot.summary.calls?.youtubeSearches<0){
      throw Error('G2_RESEARCH_PRIOR_QA_OR_QUEUE_GENERATION_MISMATCH')
    }
  }
  if (offset > pending.length) throw new Error('G2_RESEARCH_CURSOR_PAST_END')
  const selected = pending.slice(offset,offset+limit)
  const nextOffset = offset+selected.length >= pending.length
    ? null : offset+selected.length
  const reusable=selected.filter(x=>knownMap?.has(x.tmdbId))
  const reusableVideoIds=reusable.reduce((sum,x)=>sum+knownMap.get(x.tmdbId).length,0)
  const skippedSearchCalls=reusable.length*searchesPerTitle
  const plannedSearchCalls=(selected.length-reusable.length)*searchesPerTitle
  const potentialApiCost = plannedSearchCalls*YOUTUBE_SEARCH_QUOTA_UNITS
  return {
    mode:YOUTUBE_FULL_CATALOG_PLAN,
    generatedAt:asOf,
    basis:{
      canonicalInventoryGeneratedAt:inventory.generatedAt,
      publicIndexGeneratedAt:publicIndex.generatedAt,
      completeCanonicalTitleReferences:inventory.candidates.length,
      completeCanonicalMovies:inventory.candidates.filter(x=>x.type==='movie').length,
      completeCanonicalSeries:inventory.candidates.filter(x=>x.type==='series').length,
      includesPersonalAndProfileReferences:true,
      exposesPersonalDocumentPaths:false,
      exactYoutubeBadgesOnlyFromPublicSearchIndex:true,
      privateProfileYoutubeBadgeCoverage:'not-available-from-inventory',
      publicYoutubeBadgedTitles:pending.length,
      publicYoutubeBadgedMovies:pending.length,
      publicYoutubeBadgedSeriesDeferred:publicYoutubeBadgedSeries,
      canonicalAndPublicBadgedTitles:catalogBadged.length,
      publicSearchOnlyBadgedTitles:publicOnly.length,
      // Do NOT make 'not in public' into absent-on-YouTube.
      canonicalTitlesWithoutKnownPublicYoutubeBadge:
        inventory.candidates.length-catalogBadged.length,
    },
    batch:{
      offset,limit,selectedCount:selected.length,nextOffset,
      queueIdentity,
      continuationRequiredForNextBatch:nextOffset!==null,
      defaultSearchDailyCallLimit:YOUTUBE_SEARCH_DEFAULT_DAILY_CALL_LIMIT,
      defaultDailyCallLimitIsProjectActual:false,
      total:pending.length,
      fullyScanned:nextOffset===null,
      knownCandidateReuseMovies:reusable.length,
      knownCandidateReusedVideoIds:reusableVideoIds,
      youtubeSearchCallsAvoided:skippedSearchCalls,
      plannedSearchesPerUncachedMovie:searchesPerTitle,
      researchPhase:searchesPerTitle===1?'single-search-first-pass':'historical-two-search',
      youtubeSearchCallsPlanned:plannedSearchCalls,
      estimatedYoutubeSearchQuotaUnits:potentialApiCost,
      searchesRemainingAgainstUnsharedDefaultDailyLimit:
        YOUTUBE_SEARCH_DEFAULT_DAILY_CALL_LIMIT-plannedSearchCalls,
      quotaUnitBudget:YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA,
      youtubeVideoDetailCallsPlanned:0,
      realYoutubeApiRequestsPerformed:0,
      tmdbApiRequestsPerformed:0,
    },
    // Deliberately NOT a source envelope or a provider/badge publication.
    plan:selected,
    confirmedDirectLinks:0,verifiedDEOffers:0,imports:0,
    publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,
    badgeWrites:0,nightlyWrites:0,
  }
}
