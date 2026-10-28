import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {pacificSearchDay} from '../scripts/youtube-g2-pacific-search-preflight.mjs'
const read=name=>readFileSync(new URL('../.github/workflows/'+name+'.yml',import.meta.url),'utf8')
const chain=read('moviehub-nightly-pipeline')
const nightly=read('youtube-g2-nightly-discovery')
const known=read('youtube-g2-global-known-no-search')
const deploy=read('deploy-firebase')
const watchdog=read('data-workflow-watchdog')

describe('single permanently chained 00:10 Europe/Berlin production night (#388)',()=>{
  it('uses exactly one scheduled night start and no obsolete independent 20:17/22:17/00:17 starts',()=>{
    expect(chain).toMatch(/- cron: '10 0 \* \* \*'\n\s+timezone: Europe\/Berlin/)
    for(const s of [nightly,known,deploy]){
      expect(s).not.toMatch(/^  schedule:/m)
      expect(s).toContain('  workflow_call:')
      expect(s).toContain('  workflow_dispatch:')
    }
    expect(deploy).toContain('  push:')
    expect(deploy).toContain('nightly_chain:')
    expect(watchdog).toContain('DATA_WORKFLOW_NAME: MovieHub Nightly Pipeline')
    expect(watchdog).toContain("DATA_WORKFLOW_MINUTE: '10'")
  })
  it('chains completion, not time estimates, and fails closed on quota without blocking normal deploy',()=>{
    expect(chain).toContain('needs: night-gate')
    expect(chain).toContain('needs: [night-gate, discovery]')
    expect(chain).toContain('needs: [night-gate, discovery, known-videos]')
    expect(chain).toContain('needs: [night-gate, discovery, known-videos, firebase]')
    expect(chain).toContain("needs.night-gate.outputs.should_run == 'true'")
    expect(chain).toContain('always() && !cancelled()')
    expect(chain).toContain('uses: ./.github/workflows/youtube-g2-nightly-discovery.yml')
    expect(chain).toContain('uses: ./.github/workflows/youtube-g2-global-known-no-search.yml')
    expect(chain).toContain('uses: ./.github/workflows/deploy-firebase.yml')
    expect(chain).toContain('with:\n      nightly_chain: true')
    expect(chain).toContain('name: source-adapter-artifacts-')
    expect(chain).toContain('node scripts/moviehub-nightly-chain-report.mjs')
    expect(nightly).toContain('cancel-in-progress: false')
    expect(known).toContain('G2_GLOBAL_CACHED_YOUTUBE_SEARCH_FORBIDDEN')
    expect(deploy).toContain('group: firebase-production')
    expect(deploy).toContain("inputs.nightly_chain && 'workflow_call'")
  })
  it('preserves Pacific safety guard in both CET and CEST at 00:10, including the new PT day',()=>{
    for(const start of ['2026-10-28T22:10:00.000Z','2026-12-02T23:10:00.000Z',
      '2027-07-01T22:10:00.000Z']){
      const berlin=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',
        hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(start))
      expect(berlin).toBe('00:10')
      const pt=pacificSearchDay(start)
      expect(Date.parse(start)-Date.parse(pt.start)).toBeGreaterThan(2*3600_000)
    }
  })
})
