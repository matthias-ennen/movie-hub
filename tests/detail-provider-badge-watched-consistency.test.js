import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'

const detail=readFileSync(new URL('../src/components/DetailModal.jsx',import.meta.url),'utf8')
const streaming=detail.match(/function openStreamingProvider\(providerId\) \{([\s\S]*?)\n  \}\n/)?.[1]
const live=detail.match(/function openLiveProvider\(providerId\) \{([\s\S]*?)\n  \}\n/)?.[1]

describe('detail page: provider badge click always marks watched',()=>{
  it('marks watched before launching standard AND provisional YouTube provider routes',()=>{
    expect(streaming).toBeTruthy()
    expect(streaming).toContain('markWatchedFromProvider()')
    const mark=streaming.indexOf('markWatchedFromProvider()')
    const routeSelection=streaming.indexOf('const exactRoute = verifiedRoute || provisionalRoute || bestEffortRoute')
    const unifiedLaunch=streaming.indexOf('if (exactRoute && launchProviderPlaybackRoute(')
    expect(mark).toBeGreaterThan(0)
    expect(streaming).toContain('const verifiedRoute =')
    expect(streaming).toContain('const provisionalRoute =')
    expect(streaming).toContain('const bestEffortRoute =')
    expect(routeSelection).toBeGreaterThan(mark)
    expect(unifiedLaunch).toBeGreaterThan(routeSelection)
    expect(streaming).not.toMatch(/if\s*\(\s*!provisionalRoute\s*\)\s*markWatchedFromProvider\(\)/)
    // A badge without any launch destination must not be marked watched.
    expect(streaming.indexOf('if (!destination) return')).toBeLessThan(mark)
  })
  it('keeps the same watched action on live TV badges and local MovieHub media',()=>{
    expect(live).toContain('markWatchedFromProvider()')
    expect(live.indexOf('markWatchedFromProvider()'))
      .toBeLessThan(live.indexOf('launchProviderPlaybackRoute('))
    expect(detail).toContain('markWatched: markWatchedFromProvider')
  })
  it('keeps the established watched-at update with no playlist price-class dependency',()=>{
    const start=detail.indexOf('function markWatchedFromProvider()')
    const stop=detail.indexOf('function openLiveProvider(',start)
    const mark=detail.slice(start,stop)
    expect(mark).toContain('watched: true')
    expect(mark).toContain('watchedAt')
    expect(mark).toContain('watchedMarkedAt')
    expect(mark).not.toContain('playlistMode')
  })
})
