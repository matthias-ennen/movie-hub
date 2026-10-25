import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const file=readFileSync(
  new URL('../.github/workflows/youtube-g2-global-known-no-search.yml',import.meta.url),
  'utf8',
)
const live=readFileSync(
  new URL('../scripts/youtube-g2-global-known-no-search-live.mjs',import.meta.url),
  'utf8',
)
describe('scheduled no-search known-video refresh remains private',()=>{
  it('runs once a day on the main branch and keeps manual authenticated option',()=>{
    expect(file).toContain("cron: '35 5 * * *'")
    expect(file).toContain("github.ref == 'refs/heads/main'")
    expect(file).toContain("github.event_name == 'schedule'")
    expect(file).toContain("github.event_name == 'workflow_dispatch'")
    expect(file).toContain("contains(github.event.head_commit.message, '[youtube-global-known-once]')")
    expect(file).toContain('cancel-in-progress: false')
  })
  it('reads shared private checkpoint and never triggers full-catalog or search',()=>{
    expect(file).toContain('node scripts/youtube-g2-durable-candidate-checkpoint.mjs read')
    expect(file).toContain('node scripts/youtube-g2-global-known-no-search-live.mjs')
    expect(file).toContain('G2_GLOBAL_CACHED_YOUTUBE_SEARCH_FORBIDDEN')
    expect(live).toContain("if(endpoint!=='videos')throw Error('G2_GLOBAL_CACHED_YOUTUBE_SEARCH_FORBIDDEN')")
    expect(file).not.toContain('node scripts/youtube-g2-full-catalog-queue-live.mjs')
    expect(file).not.toContain('node scripts/youtube-g2-durable-candidate-checkpoint.mjs merge')
    expect(file).not.toContain('youtubeApi(\'search\',')
  })
  it('stores only a protected 7-day candidate report, not routes or catalog writes',()=>{
    expect(file).toContain('actions/upload-artifact@v7')
    expect(file).toContain('retention-days: 7')
    expect(file).toContain('if-no-files-found: error')
    expect(file).toContain('summary.searchCalls!==0')
    expect(file).toContain('summary.publishedDirectRoutes!==0')
    expect(file).toContain('summary.independentlyVerifiedDeOffers!==0')
    expect(file).toContain('summary.firebaseWrites!==0')
    expect(live).toContain('firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0')
    expect(file).not.toContain('firebase deploy')
  })
})
