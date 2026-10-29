/**
 * #388 – closed GitHub Actions entrypoint review, not a Google-wide inventory.
 * Any NEW YouTube workflow must be deliberately added to the reviewed set;
 * six old search jobs stay disabled, three v1 CAS-budgeted jobs stay explicit,
 * and the other reviewed jobs may not start an unbudgeted search request.
 *
 * No test grants an additional YouTube search or a 95/day production rollout.
 */
import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'

const reviewed=Object.freeze([
  "youtube-adapter-live-preflight-g2",
  "youtube-api-g1-inventory",
  "youtube-api-g1-readonly",
  "youtube-g1-matcher-v1-final",
  "youtube-g1-tmdb-research",
  "youtube-g2-bootstrap-budget-forecast",
  "youtube-g2-curated-tmdb-membership",
  "youtube-g2-curated-two-playlists",
  "youtube-g2-five-search-checkpoint-import",
  "youtube-g2-five-search-public-batch",
  "youtube-g2-full-catalog-queue",
  "youtube-g2-global-known-no-search",
  "youtube-g2-large-live-audit",
  "youtube-g2-merge-curated-known-candidates",
  "youtube-g2-monitoring-readonly-audit",
  "youtube-g2-monitoring-response-diagnostic",
  "youtube-g2-nightly-discovery",
  "youtube-g2-nine-missing-source-probe",
  "youtube-g2-one-search-no-search-review",
  "youtube-g2-one-search-quota-preflight",
  "youtube-g2-overflow-private-recheck",
  "youtube-g2-pacific-search-preflight",
  "youtube-g2-pending-video-refresh",
  "youtube-g2-private-candidate-checkpoint",
  "youtube-g2-quota-readonly-audit",
  "youtube-g2-recovery-badge-bridge",
  "youtube-g2-search-api-diagnostic",
  "youtube-g2-six-offline-evidence",
  "youtube-g2-tmdb-first-known-videos-refresh",
  "youtube-g2-tmdb-first-link-pilot",
  "youtube-g2-tmdb-first-offline-review",
  "youtube-movies-all-categories-hundred-g1",
  "youtube-movies-channel-uploads-g1",
  "youtube-movies-fifty-g1",
  "youtube-movies-five-work-evidence-g1",
  "youtube-movies-forty-seven-g1",
  "youtube-movies-hundred-tmdb-g1",
  "youtube-movies-public-membership-g1",
  "youtube-movies-store-id-g1",
  "youtube-movies-three-offers-g1",
  "youtube-movies-three-sorts-g1",
  "youtube-movies-tmdb-provider-g1",
  "youtube-movies-top-three-qa-g1",
  "youtube-movies-twenty-one-g1",
  "youtube-movies-user-twelve-g1"
])
const conservativeLive=new Map([
  ['youtube-g2-nightly-discovery',['youtube-g2-nightly-discovery-live','reserveWithAtomicGcs']],
  ['youtube-g2-five-search-public-batch',['youtube-g2-five-search-public-batch','admitPreparedFiveSearches']],
  ['youtube-g2-full-catalog-queue',['youtube-g2-full-catalog-queue-live','admitPreparedOneSearchPlan']],
])
const diagnostic=new Map([
  ['youtube-g2-search-api-diagnostic','youtube-g2-search-api-diagnostic'],
])
const disabled=new Map([
  ['youtube-movies-all-categories-hundred-g1','youtube-movies-all-categories-hundred-g1'],
  ['youtube-movies-fifty-g1','youtube-movies-fifty-g1'],
  ['youtube-movies-store-id-g1','youtube-movies-store-id-g1'],
  ['youtube-movies-three-sorts-g1','youtube-movies-three-sorts-g1'],
  ['youtube-g2-tmdb-first-link-pilot','youtube-g2-tmdb-first-link-pilot'],
  ['youtube-g2-one-search-quota-preflight','youtube-g2-one-search-quota-diagnostic'],
])
const workflow=n=>readFileSync(new URL('../.github/workflows/'+n+'.yml',import.meta.url),'utf8')
const script=n=>readFileSync(new URL('../scripts/'+n+'.mjs',import.meta.url),'utf8')
function jobGate(src){
  const lines=src.split(/\r?\n/)
  const indexes=lines.flatMap((s,i)=>/^    if: /.test(s)?[i]:[])
  expect(indexes,'every classified search workflow must have one job gate').toHaveLength(1)
  const line=lines[indexes[0]].trim()
  return line==='if: >-'?lines[indexes[0]+1].trim():line.slice(4).trim()
}
const searchCall=/\b(?:youtubeApi|youtubeGet|api)\s*\(\s*['"]search['"]/
const endpointSearch=/\bendpoint\s*===?\s*['"]search['"]/
const bareSearchUrl=/https?:\/\/[^'"\s]*youtube\/v3\/search\b/

describe('YouTube #388 workflow entrypoint budget closure',()=>{
  it('requires explicit review of every youtube-named GitHub Actions workflow',()=>{
    const actual=readdirSync(new URL('../.github/workflows/',import.meta.url))
      .filter(n=>/^youtube.*\.yml$/.test(n)).map(n=>n.slice(0,-4)).sort()
    expect(actual).toEqual([...reviewed].sort())
    expect(new Set(reviewed).size).toBe(reviewed.length)
    expect(reviewed).toHaveLength(45)
  })
  it('keeps all six historical search jobs inactive at job boundary',()=>{
    expect(disabled.size).toBe(6)
    for(const [name,runner] of disabled){
      const src=workflow(name)
      expect(jobGate(src),name).toMatch(/^false\s*&&/)
      expect(src).toContain('run: node scripts/'+runner+'.mjs')
    }
  })
  it('keeps exactly three live search entrypoints bound to conservative v1 GCS',()=>{
    expect(conservativeLive.size).toBe(3)
    for(const [name,[runner,admission]] of conservativeLive){
      const src=workflow(name)
      expect(jobGate(src),name).not.toMatch(/^false\s*&&/)
      expect(src).toContain('run: node scripts/'+runner+'.mjs')
      expect(script(runner)).toContain(admission)
    }
    const ledger=script('youtube-g2-atomic-search-budget-ledger')
    expect(ledger).toContain('ADAPTER_SEARCH_DAY_CAP=RESEARCH_DAY_CAP')
    const preflight=script('youtube-g2-pacific-search-preflight')
    expect(preflight).toContain('RESEARCH_DAY_CAP=50')
    expect(ledger).toContain('DEGRADED_ONE_SEARCH_DAY_CAP=1')
  })
  it('allows exactly one human-triggered and tightly bounded API diagnosis outside production',()=>{
    expect(diagnostic.size).toBe(1)
    const yml=workflow('youtube-g2-search-api-diagnostic')
    expect(yml).toContain('  workflow_dispatch:')
    expect(yml).not.toMatch(/^  schedule:|^  push:/m)
    expect(yml).toContain("github.event_name == 'workflow_dispatch'")
    expect(yml).toContain('timeout-minutes: 270')
    expect(yml).toContain('run: node scripts/youtube-g2-search-api-diagnostic.mjs')
    const src=script('youtube-g2-search-api-diagnostic')
    expect(src).toContain('DIAG_DURATIONS=Object.freeze([60,240])')
    expect(src).toContain('DIAG_INTERVAL_MINUTES=20')
    expect(src).toContain("apiCall('search'")
    expect(src).not.toMatch(/(?:getStorage|firebase-admin|firestoreWrites|catalogWrites|badgeWrites|youtube-g2-nightly-search-journal)/)
  })
  it('keeps other reviewed entrypoint runner scripts free of direct search transport',()=>{
    const unclassified=reviewed.filter(n=>!disabled.has(n)&&!conservativeLive.has(n)&&!diagnostic.has(n))
    expect(unclassified).toHaveLength(35)
    for(const name of unclassified){
      const yml=workflow(name)
      expect(yml,name).not.toMatch(bareSearchUrl)
      const entries=[...yml.matchAll(/\bnode\s+(scripts\/[A-Za-z0-9_./-]+\.mjs)\b/g)]
        .map(x=>x[1])
      for(const path of entries){
        const src=readFileSync(new URL('../'+path,import.meta.url),'utf8')
        expect(src,name+' -> '+path).not.toMatch(searchCall)
        expect(src,name+' -> '+path).not.toMatch(bareSearchUrl)
        // Do NOT assert generic endpoint dispatch is harmless. New dynamic
        // dispatchers require manual inspection, even with only 0-search
        // callsites present today.
        if(endpointSearch.test(src)){
          expect(src,name+' -> '+path).not.toMatch(/\byoutubeGet\(endpoint/)
        }
      }
    }
  })
  it('keeps the future 95-slot gateway separate from active workflows',()=>{
    for(const name of reviewed){
      const yml=workflow(name)
      expect(yml,name).not.toContain('youtube-g2-shared-search-transport.mjs')
    }
    expect(script('youtube-g2-shared-search-transport'))
      .toContain('executeSharedBudgetedSearch')
  })
})
