import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {pacificSearchDay} from '../scripts/youtube-g2-pacific-search-preflight.mjs'

const nightly=readFileSync(new URL(
  '../.github/workflows/youtube-g2-nightly-discovery.yml',import.meta.url),'utf8')
const nightlySource=readFileSync(new URL(
  '../scripts/youtube-g2-nightly-discovery-live.mjs',import.meta.url),'utf8')
const known=readFileSync(new URL(
  '../.github/workflows/youtube-g2-global-known-no-search.yml',import.meta.url),'utf8')
const deploy=readFileSync(new URL(
  '../.github/workflows/deploy-firebase.yml',import.meta.url),'utf8')

describe('permanent Berlin YouTube nightly sequence (#388)',()=>{
  it('keeps the existing independent 00:17 DST-aware Firebase cadence unchanged',()=>{
    expect(deploy).toContain("cron: '17 22 * * *'")
    expect(deploy).toContain("cron: '17 23 * * *'")
    expect(deploy).toContain("DATA_WORKFLOW_TIMEZONE: Europe/Berlin")
    expect(deploy).toContain("DATA_WORKFLOW_HOUR: '0'")
    expect(deploy).toContain("DATA_WORKFLOW_MINUTE: '17'")
  })
  it('schedules discovery then known videos before Firebase, respecting local DST',()=>{
    expect(nightly).toMatch(/- cron: '17 20 \* \* \*'\n\s+timezone: Europe\/Berlin/)
    expect(known).toMatch(/- cron: '17 22 \* \* \*'\n\s+timezone: Europe\/Berlin/)
    const dates=[
      // Winter: Berlin UTC+1; YouTube Pacific midnight 07:00 UTC.
      ['2026-10-28T19:17:00.000Z','2026-10-28T21:17:00.000Z',
        '2026-10-28T23:17:00.000Z'],
      // Summer: Berlin UTC+2; Pacific midnight 07:00 UTC.
      ['2027-07-01T18:17:00.000Z','2027-07-01T20:17:00.000Z',
        '2027-07-01T22:17:00.000Z'],
    ]
    for(const [discovery,refresh,publication] of dates){
      const fmt=x=>new Intl.DateTimeFormat('en-GB',{
        timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',
        hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',
      }).format(new Date(x))
      expect(fmt(discovery)).toContain('20:17')
      expect(fmt(refresh)).toContain('22:17')
      expect(fmt(publication)).toContain('00:17')
      const reset=Date.parse(pacificSearchDay(discovery).start)
      expect(Date.parse(discovery)-reset).toBeGreaterThan(2*3600000)
      expect(Date.parse(discovery)).toBeLessThan(Date.parse(refresh))
      expect(Date.parse(refresh)).toBeLessThan(Date.parse(publication))
    }
  })
  it('retains immediate trusted successful handoff and independent failure fallback',()=>{
    expect(known).toContain('workflow_run:')
    expect(known).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(known).toContain("github.event.workflow_run.head_repository.full_name == github.repository")
    expect(known).toContain("github.event_name == 'schedule'")
    expect(known).toContain('G2_GLOBAL_CACHED_YOUTUBE_SEARCH_FORBIDDEN')
    expect(nightlySource).toContain('reserveWithAtomicGcs')
    expect(nightly).toContain("contains(github.event.head_commit.message, '[youtube-nightly-once]')")
    expect(nightly).toContain('cancel-in-progress: false')
    expect(known).toContain('cancel-in-progress: false')
  })
})
