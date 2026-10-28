import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'

const archivedSearchJobs=Object.freeze([
  ['youtube-movies-all-categories-hundred-g1',
    'youtube-movies-all-categories-hundred-g1'],
  ['youtube-movies-fifty-g1','youtube-movies-fifty-g1'],
  ['youtube-movies-store-id-g1','youtube-movies-store-id-g1'],
  ['youtube-movies-three-sorts-g1','youtube-movies-three-sorts-g1'],
  ['youtube-g2-tmdb-first-link-pilot','youtube-g2-tmdb-first-link-pilot'],
  ['youtube-g2-one-search-quota-preflight',
    'youtube-g2-one-search-quota-diagnostic'],
])

const workflow=name=>readFileSync(new URL(
  '../.github/workflows/'+name+'.yml',import.meta.url),'utf8')
const script=name=>readFileSync(new URL(
  '../scripts/'+name+'.mjs',import.meta.url),'utf8')
function jobIfExpression(file){
  const lines=file.split(/\r?\n/)
  const matches=lines.flatMap((s,i)=>/^    if: /.test(s)?[i]:[])
  expect(matches,'one job-level if required').toHaveLength(1)
  const index=matches[0]
  const start=lines[index].trim()
  return start==='if: >-'?lines[index+1].trim():start.slice(4).trim()
}

describe('YouTube #388: historical search research cannot escape shared PT budget',()=>{
  it.each(archivedSearchJobs)(
    '%s is suspended at its actual job boundary, retaining source for migration',
    (name,runner)=>{
      const yml=workflow(name)
      expect(yml).toContain('workflow_dispatch:')
      expect(yml).toContain('run: node scripts/'+runner+'.mjs')
      expect(yml).toContain('suspended until search.list uses shared')
      expect(jobIfExpression(yml)).toMatch(/^false\s*&&/)
      // Source remains for review; a job skip does not delete research history.
      expect(script(runner).length).toBeGreaterThan(1000)
    })
  it('prevents a future accidental removal of any of the six job guards',()=>{
    expect(archivedSearchJobs).toHaveLength(6)
    expect(new Set(archivedSearchJobs.map(x=>x[0])).size).toBe(6)
    expect(new Set(archivedSearchJobs.map(x=>x[1])).size).toBe(6)
  })
  it('preserves currently authorized, conservatively budgeted searches',()=>{
    const active=[
      ['youtube-g2-nightly-discovery','youtube-g2-nightly-discovery-live',
        'reserveWithAtomicGcs'],
      ['youtube-g2-five-search-public-batch','youtube-g2-five-search-public-batch',
        'admitPreparedFiveSearches'],
      ['youtube-g2-full-catalog-queue','youtube-g2-full-catalog-queue-live',
        'admitPreparedOneSearchPlan'],
    ]
    for(const [name,runner,admission] of active){
      const yml=workflow(name)
      expect(jobIfExpression(yml)).not.toMatch(/^false\s*&&/)
      expect(yml).toContain('run: node scripts/'+runner+'.mjs')
      expect(script(runner)).toContain(admission)
    }
  })
  it('ties the real nightly name to the trusted main workflow_run recheck',()=>{
    const nightly=workflow('youtube-g2-nightly-discovery')
    const known=workflow('youtube-g2-global-known-no-search')
    const name=nightly.match(/^name: (.+)$/m)?.[1]
    expect(name).toBe('YouTube G2 – nightly bounded public-movie discovery (private, no offers)')
    expect(known).toContain('workflow_run:')
    expect(known).toContain('      - "'+name+'"')
    expect(known).toContain('types: [completed]')
    expect(known).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(known).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(known).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository')
    expect(known).toContain("github.event.workflow_run.event == 'push'")
    expect(known).toContain("github.event.workflow_run.event == 'schedule'")
    expect(known).toContain('run: node scripts/youtube-g2-global-known-no-search-live.mjs')
    expect(known).toContain("if(endpoint!=='videos')")
    expect(nightly).toContain("contains(github.event.head_commit.message, '[youtube-nightly-once]')")
    expect(nightly).toContain('  workflow_call:')
    expect(nightly).not.toContain('  schedule:')
    expect(known).toContain('  workflow_call:')
    // A targeted push acceptance is not the scheduled acceptance proof.
    expect(known).toContain("github.event.workflow_run.event == 'workflow_dispatch'")
  })
  it('keeps source-only video/playlist refreshes available without search',()=>{
    for(const name of ['youtube-g2-curated-two-playlists',
      'youtube-g2-global-known-no-search']){
      expect(jobIfExpression(workflow(name))).not.toMatch(/^false\s*&&/)
    }
  })
})
