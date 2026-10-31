import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeClock } from '../src/performance/runtimeClock.js'
import { buildWaipuTvViewModel, createWaipuTvViewModelBuilder, nextTvDayBoundary } from '../src/waipu/waipuTvCatalog.js'
import { buildTv14DayRows, createTv14DayRowsBuilder, nextTv14DayTransition } from '../src/tv/tv14DaySummary.js'
import { advanceLiveAvailabilityEntries, createLiveAvailabilityMerger, mergeLiveAvailability } from '../src/sources/liveAvailabilityIndex.js'

afterEach(() => vi.useRealTimers())
const epoch = Date.parse('2026-10-31T10:00:00Z')
function fixture() {
  const airings = [0, 1, 2].map((i) => ({ tmdbId: i + 1, type: 'movie', stationId: 'zdf', providerIds: ['waipu'],
    startTime: new Date(epoch + (i + 1) * 3600000).toISOString(), stopTime: new Date(epoch + (i + 2) * 3600000).toISOString() }))
  return { airings, titles: airings.map((a) => ({ tmdbId: a.tmdbId, id: `movie-${a.tmdbId}`, type: 'movie', title: `Film ${a.tmdbId}`, genres: [{ id: 28 }], providerIds: [], popularity: a.tmdbId })),
    stationOrder: ['zdf'], selectedPeriodId: 'day:2026-10-31', availableDays: [{ key: '2026-10-31' }], includeHero: false }
}

describe('shared deadline clock', () => {
  it('uses one timer and one timestamp for simultaneous deadlines; unrelated consumers keep their snapshot', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch)
    const clock = createRuntimeClock({ windowRef: null, documentRef: null })
    const a = vi.fn(), b = vi.fn(), c = vi.fn()
    const stops = [clock.subscribe('a', a), clock.subscribe('b', b), clock.subscribe('c', c)]
    const unchanged = clock.getSnapshot('c')
    clock.setDeadline('a', epoch + 100); clock.setDeadline('b', epoch + 100); clock.setDeadline('c', epoch + 1000)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(101)
    expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce(); expect(c).not.toHaveBeenCalled()
    expect(clock.getSnapshot('a').now).toBe(clock.getSnapshot('b').now)
    expect(clock.getSnapshot('c')).toBe(unchanged)
    stops.forEach((stop) => stop()); expect(vi.getTimerCount()).toBe(0)
  })
  it('pauses while hidden and catches up once on foreground, including backward wall-clock changes', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch)
    const doc = new EventTarget(), win = new EventTarget(); doc.visibilityState = 'visible'
    const clock = createRuntimeClock({ documentRef: doc, windowRef: win })
    const notify = vi.fn(); const stop = clock.subscribe('tv', notify)
    clock.setDeadline('tv', epoch + 100)
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(10000); expect(notify).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('focus'))
    expect(notify).toHaveBeenCalledOnce(); expect(clock.getSnapshot('tv').now).toBe(epoch + 10000)
    vi.setSystemTime(epoch - 10000); win.dispatchEvent(new Event('focus'))
    expect(clock.getSnapshot('tv').now).toBe(epoch - 10000)
    stop()
  })
  it('registers the next 06:00 boundary across DST without assuming 24 hours', () => {
    expect(new Date(nextTvDayBoundary(Date.parse('2026-10-24T05:00:00Z')))).toEqual(new Date('2026-10-25T05:00:00Z'))
    expect(new Date(nextTvDayBoundary(Date.parse('2026-03-28T06:00:00Z')))).toEqual(new Date('2026-03-29T04:00:00Z'))
  })
})

describe('incremental cooperative TV models', () => {
  it('preserves complete model parity through time transitions and reuses unchanged cards and rows', async () => {
    const input = fixture(), build = createWaipuTvViewModelBuilder()
    const a = await build({ ...input, now: epoch })
    expect(a).toEqual(buildWaipuTvViewModel({ ...input, now: epoch }))
    expect(await build({ ...input, now: epoch + 1000 })).toBe(a)
    for (const now of [epoch + 3600000, epoch + 7200000, epoch + 10800000, epoch - 3600000]) {
      expect(await build({ ...input, now })).toEqual(buildWaipuTvViewModel({ ...input, now }))
    }
    const controller = new AbortController(); controller.abort()
    await expect(build({ ...input, now: epoch }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('updates the 14-day summary at its one-hour SOON boundary even without a loaded day', async () => {
    const input = fixture()
    const entries = input.airings.map((a) => ({ ...input.titles[a.tmdbId - 1], airingOptions: [a], primeTimeOptions: [], genreIds: [28] }))
    const config = { entries, titles: input.titles, activeWaipuStationIds: ['zdf'], activeJoynStationIds: [], artworkOptions: {} }
    const build = createTv14DayRowsBuilder()
    const a = await build({ ...config, now: epoch + 1000 })
    expect(await build({ ...config, now: epoch + 2000 })).toBe(a)
    expect(nextTv14DayTransition(entries, epoch + 1000)).toBe(epoch + 3600000)
    for (const now of [epoch, epoch + 3600000, epoch + 7200000]) expect(await build({ ...config, now })).toEqual(buildTv14DayRows({ ...config, now }))
  })
  it('reuses live entries until an airing ends and updates only affected availability titles', async () => {
    const input = fixture()
    let entries = input.airings.map((airing) => ({ key: `movie:${airing.tmdbId}`, type: 'movie', tmdbId: airing.tmdbId, providers: [{ providerId: 'waipu', airings: [airing] }] }))
    entries = advanceLiveAvailabilityEntries(entries, { now: epoch })
    expect(advanceLiveAvailabilityEntries(entries, { now: epoch + 1000 })).toBe(entries)
    const merge = createLiveAvailabilityMerger(), acceptLiveProvider = () => true
    const a = await merge(input.titles, entries, { now: epoch, acceptLiveProvider })
    expect(a).toEqual(mergeLiveAvailability(input.titles, entries, { now: epoch, acceptLiveProvider }))
    expect(await merge(input.titles, entries, { now: epoch + 1000, acceptLiveProvider })).toBe(a)
    const updatedEntries = advanceLiveAvailabilityEntries(entries, { now: epoch + 7200000 })
    expect(updatedEntries[0]).toBe(entries[1])
    const b = await merge(input.titles, updatedEntries, { now: epoch + 7200000, acceptLiveProvider })
    expect(b).toEqual(mergeLiveAvailability(input.titles, updatedEntries, { now: epoch + 7200000, acceptLiveProvider }))
  })
})
