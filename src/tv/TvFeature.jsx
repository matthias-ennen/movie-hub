import { orderTvStations, combinedTvStationOrder as getCombinedStationOrder } from '../settings/stationOrder.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRuntimeClock } from '../hooks/useRuntimeClock.js'
import { useAsyncModel } from '../hooks/useAsyncModel.js'
import TvView from '../components/TvView.jsx'
import { resolvePresentationArtwork } from '../catalog/artworkRotation.js'
import { isTvPresentationReady } from '../performance/liveCatalogStartup.js'
import {
  cancelPerformanceSpan,
  finishPerformanceSpan,
  recordPerformanceEvent,
  startPerformanceSpan,
} from '../performance/performanceDiagnostics.js'
import {
  buildWaipuTvViewModel,
  createWaipuTvViewModelBuilder,
  nextTvDayBoundary,
  nextTvAiringTransition,
  tvDayKey,
} from '../waipu/waipuTvCatalog.js'
import { createTv14DayRowsBuilder, loadTv14DaySummary, nextTv14DayTransition } from './tv14DaySummary.js'
import {
  buildTvRuntimeHeroItems,
  buildTvRuntimeSchedule,
  loadTvRuntimeHero,
  loadTvRuntimeIndex,
  loadConsistentTvRuntimeDay,
  TV_RUNTIME_CACHE_MAX_AGE_MS,
} from './tvRuntimeClient.js'

const EMPTY_LIST = Object.freeze([])
const EMPTY_OPTIONS = Object.freeze({})
const LIVE_PROVIDERS = Object.freeze(['waipu', 'joyn'])

export default function TvFeature({
  waipuStationCatalog,
  joynStationCatalog,
  disabledWaipuStationIds = EMPTY_LIST,
  disabledJoynStationIds = EMPTY_LIST,
  enabledProviderIds = LIVE_PROVIDERS,
  stationSelectionLoading = true,
  joynStationSelectionLoading = true,
  liveAvailabilityEntries = EMPTY_LIST,
  artworkOptions = EMPTY_OPTIONS,
  activationRequest = null,
  onActivationUnavailable,
  onStationCatalogsRequested,
  onOpen,
}) {
  const [tvRuntimeHero, setTvRuntimeHero] = useState({
    status: 'idle',
    generatedAt: null,
    entries: [],
  })
  const [tvSchedule, setTvSchedule] = useState({ status: 'idle', airings: [], titles: [] })
  const [tv14DaySummary, setTv14DaySummary] = useState({ status: 'idle', entries: [] })
  const [tvRuntimeIndex, setTvRuntimeIndex] = useState({
    status: 'idle',
    generatedAt: null,
    providers: [],
    days: [],
  })
  const [tvScheduleRequested, setTvScheduleRequested] = useState(false)
  const [tvPeriodId, setTvPeriodId] = useState(() => `day:${tvDayKey(Date.now())}`)
  const tvPerformanceSequenceRef = useRef(0)
  const preparedScheduleRef = useRef(null)
  const reconciledHeroRef = useRef(null)
  const tvRuntimeHeroRequestRef = useRef(null)
  const tvPosterPhaseStartedRef = useRef(false)

  const [resourceRevision, setResourceRevision] = useState(0)
  const refreshAtRef = useRef(Date.now() + TV_RUNTIME_CACHE_MAX_AGE_MS)
  const lastRefreshRef = useRef(Date.now())
  const transitionAirings = useMemo(() => [
    ...tvSchedule.airings,
    ...tvRuntimeHero.entries.flatMap((entry) => entry.airings || []),
  ], [tvSchedule.airings, tvRuntimeHero.entries, tv14DaySummary.entries, tvPeriodId])
  const clock = useRuntimeClock((now) => Math.min(
    nextTvAiringTransition(transitionAirings, now) ?? Infinity,
    tvPeriodId === '14-days' ? nextTv14DayTransition(tv14DaySummary.entries, now) : Infinity,
    nextTvDayBoundary(now), refreshAtRef.current,
  ))
  const tvClock = clock.now
  const previousTodayRef = useRef(tvDayKey(tvClock))
  useEffect(() => {
    const today = tvDayKey(tvClock)
    if (today !== previousTodayRef.current) {
      const previous = previousTodayRef.current
      previousTodayRef.current = today
      setTvPeriodId((period) => period === `day:${previous}` ? `day:${today}` : period)
    }
    const resumeRefresh = clock.reason === 'resume' && tvClock - lastRefreshRef.current >= 30_000
    if (resumeRefresh || tvClock >= refreshAtRef.current) {
      lastRefreshRef.current = tvClock
      refreshAtRef.current = tvClock + TV_RUNTIME_CACHE_MAX_AGE_MS
      setResourceRevision((revision) => revision + 1)
    }
  }, [clock.reason, tvClock])

  useEffect(() => () => {
    onStationCatalogsRequested?.(false)
  }, [onStationCatalogsRequested])

  useEffect(() => {
    const controller = new AbortController()
    tvRuntimeHeroRequestRef.current = controller
    setTvRuntimeHero((current) => current.status === 'ready' ? current : ({ ...current, status: 'loading' }))
    startPerformanceSpan('tv:hero-snapshot', 'runtime')

    loadTvRuntimeHero({ signal: controller.signal, force: resourceRevision > 0 })
      .then((hero) => {
        if (controller.signal.aborted) return
        setTvRuntimeHero({
          status: 'ready',
          generatedAt: hero.generatedAt,
          entries: hero.entries,
        })
        finishPerformanceSpan('tv:hero-snapshot', 'runtime', {
          outcome: 'ready',
          entryCount: hero.entries.length,
        })
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        console.warn('TV-Runtime-Hero konnte nicht geladen werden.', error)
        setTvRuntimeHero((current) => current.status === 'ready' ? current : { status: 'unavailable', generatedAt: null, entries: [] })
        finishPerformanceSpan('tv:hero-snapshot', 'runtime', { outcome: 'error' })
      })
      .finally(() => {
        if (tvRuntimeHeroRequestRef.current === controller) {
          tvRuntimeHeroRequestRef.current = null
        }
      })

    return () => {
      if (tvRuntimeHeroRequestRef.current === controller) {
        controller.abort()
        tvRuntimeHeroRequestRef.current = null
      }
      cancelPerformanceSpan('tv:hero-snapshot', 'runtime', { reason: 'view-left' })
    }
  }, [resourceRevision])

  useEffect(() => {
    if (!tvScheduleRequested) return undefined
    const controller = new AbortController()
    setTvRuntimeIndex((current) => current.status === 'ready' ? current : ({ ...current, status: 'loading' }))
    startPerformanceSpan('tv:index', 'runtime')
    loadTvRuntimeIndex({ signal: controller.signal, force: resourceRevision > 0 })
      .then((index) => {
        if (controller.signal.aborted) return
        finishPerformanceSpan('tv:index', 'runtime', {
          dayCount: index.days.length,
          providerCount: index.providers.length,
        })
        setTvRuntimeIndex({
          status: 'ready',
          generatedAt: index.generatedAt,
          providers: index.providers,
          days: index.days,
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        finishPerformanceSpan('tv:index', 'runtime', { outcome: 'error' })
        console.warn('TV-Runtime-Index konnte nicht geladen werden.', error)
        setTvRuntimeIndex((current) => current.status === 'ready' ? current : {
          status: 'unavailable',
          generatedAt: null,
          providers: [],
          days: [],
        })
      })

    return () => { controller.abort(); cancelPerformanceSpan('tv:index', 'runtime', { reason: 'superseded' }) }
  }, [resourceRevision, tvScheduleRequested])

  useEffect(() => {
    const heroGeneration = tvRuntimeHero.generatedAt
    const indexGeneration = tvRuntimeIndex.generatedAt
    if (!heroGeneration || !indexGeneration || heroGeneration === indexGeneration
        || tvRuntimeIndex.status !== 'ready' || tvRuntimeHero.status !== 'ready') return undefined
    const pair = `${heroGeneration}|${indexGeneration}`
    if (reconciledHeroRef.current === pair) return undefined
    reconciledHeroRef.current = pair
    const controller = new AbortController()
    loadTvRuntimeHero({ signal: controller.signal, force: true }).then((hero) => {
      if (controller.signal.aborted) return
      setTvRuntimeHero(hero.generatedAt === indexGeneration
        ? { ...hero, status: 'ready' } : { status: 'unavailable', generatedAt: null, entries: [] })
    }).catch(() => {
      if (!controller.signal.aborted) setTvRuntimeHero({ status: 'unavailable', generatedAt: null, entries: [] })
    })
    return () => controller.abort()
  }, [tvRuntimeHero.generatedAt, tvRuntimeHero.status, tvRuntimeIndex.generatedAt, tvRuntimeIndex.status])

  const activeWaipuStations = useMemo(() => {
    const disabled = new Set(disabledWaipuStationIds)
    const stations = Array.isArray(waipuStationCatalog?.stations) ? waipuStationCatalog.stations : []
    return orderTvStations(stations, stations)
      .filter((station) => enabledProviderIds.includes('waipu') && !disabled.has(station.id))
  }, [disabledWaipuStationIds, enabledProviderIds, waipuStationCatalog?.stations])
  const activeWaipuStationKey = activeWaipuStations.map((station) => station.id).join('|')

  const activeJoynStations = useMemo(() => {
    const disabled = new Set(disabledJoynStationIds)
    const stations = Array.isArray(joynStationCatalog?.stations) ? joynStationCatalog.stations : []
    return orderTvStations(stations, waipuStationCatalog?.stations || [])
      .filter((station) => enabledProviderIds.includes('joyn') && !disabled.has(station.id))
  }, [disabledJoynStationIds, enabledProviderIds, joynStationCatalog?.stations, waipuStationCatalog?.stations])
  const activeJoynStationKey = activeJoynStations.map((station) => station.id).join('|')

  const combinedTvDays = useMemo(
    () => tvRuntimeIndex.status === 'ready' ? tvRuntimeIndex.days : [],
    [tvRuntimeIndex.days, tvRuntimeIndex.status],
  )
  useEffect(() => {
    if (tvRuntimeIndex.status !== 'ready' || tvPeriodId === '14-days') return
    const today = `day:${tvDayKey(tvClock)}`
    const available = combinedTvDays.filter((day) => day.key >= tvDayKey(tvClock))
    if (tvPeriodId !== today && !available.some((day) => `day:${day.key}` === tvPeriodId)) {
      setTvPeriodId(available.some((day) => `day:${day.key}` === today) ? today
        : available.length ? `day:${available[0].key}` : today)
    }
  }, [combinedTvDays, tvClock, tvPeriodId, tvRuntimeIndex.status])

  const combinedTvStationOrder = useMemo(() => getCombinedStationOrder(
    activeWaipuStations, activeJoynStations, waipuStationCatalog?.stations || [],
  ), [activeJoynStations, activeWaipuStations, waipuStationCatalog?.stations])

  useEffect(() => {
    if (!tvScheduleRequested || tvPeriodId !== '14-days') return undefined
    let cancelled = false
    const controller = new AbortController()
    setTv14DaySummary((current) => current.status === 'ready' ? current : ({ ...current, status: 'loading' }))
    startPerformanceSpan('tv:14-day', 'summary')
    loadTv14DaySummary({ signal: controller.signal, force: resourceRevision > 0 })
      .then((summary) => {
        if (cancelled) return
        finishPerformanceSpan('tv:14-day', 'summary', { entryCount: summary.entries.length })
        setTv14DaySummary({ status: 'ready', entries: summary.entries })
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        finishPerformanceSpan('tv:14-day', 'summary', { outcome: 'error' })
        console.warn('14-Tage-TV-Summary konnte nicht geladen werden.', error)
        setTv14DaySummary((current) => current.status === 'ready' ? current : { status: 'unavailable', entries: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
      cancelPerformanceSpan('tv:14-day', 'summary', { reason: 'superseded' })
    }
  }, [resourceRevision, tvPeriodId, tvScheduleRequested])

  useEffect(() => {
    if (!tvScheduleRequested) return undefined

    if (tvPeriodId === '14-days') {
      if (tv14DaySummary.status === 'idle' || tv14DaySummary.status === 'loading') {
        setTvSchedule({ status: 'loading', airings: [], titles: [] })
      } else if (tv14DaySummary.status === 'ready') {
        setTvSchedule({ status: 'ready', airings: [], titles: [] })
      } else {
        setTvSchedule({ status: 'unavailable', airings: [], titles: [] })
      }
      return undefined
    }

    const waipuLoading = waipuStationCatalog?.status === 'loading' || stationSelectionLoading
    const joynLoading = joynStationCatalog?.status === 'loading' || joynStationSelectionLoading
    const waipuReady = waipuStationCatalog?.status === 'ready'
    const joynReady = joynStationCatalog?.status === 'ready'
    const runtimeLoading = tvRuntimeIndex.status === 'idle' || tvRuntimeIndex.status === 'loading'

    if (runtimeLoading || ((waipuLoading || joynLoading) && !waipuReady && !joynReady)) {
      setTvSchedule({ status: 'loading', airings: [], titles: [] })
      return undefined
    }
    if (tvRuntimeIndex.status !== 'ready' || (!waipuReady && !joynReady)) {
      setTvSchedule({ status: 'unavailable', airings: [], titles: [] })
      return undefined
    }
    if ((!waipuReady || !activeWaipuStations.length) && (!joynReady || !activeJoynStations.length)) {
      setTvSchedule({ status: 'no-stations', airings: [], titles: [] })
      return undefined
    }

    const dayKey = String(tvPeriodId || '').startsWith('day:') ? String(tvPeriodId).slice(4) : null
    if (!dayKey) {
      setTvSchedule({ status: 'unavailable', airings: [], titles: [] })
      return undefined
    }
    if (!tvRuntimeIndex.days.some((day) => day.key === dayKey)) {
      setTvSchedule({ status: 'ready', airings: [], titles: [] })
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()
    tvPerformanceSequenceRef.current += 1
    const performanceKey = `${dayKey}:${tvPerformanceSequenceRef.current}`
    setTvSchedule((current) => current.dayKey === dayKey && current.status === 'ready' ? current : { status: 'loading', airings: [], titles: [] })
    startPerformanceSpan('tv:day', performanceKey, { dayKey })
    loadConsistentTvRuntimeDay(dayKey, tvRuntimeIndex, { signal: controller.signal })
      .then(({ day, index }) => {
        if (cancelled) return
        finishPerformanceSpan('tv:day', performanceKey, {
          dayKey,
          entryCount: day.entries.length,
        })
        startPerformanceSpan('tv:view-model', performanceKey, { dayKey })
        const selectionKey = JSON.stringify([enabledProviderIds, activeWaipuStationKey, activeJoynStationKey])
        const cached = preparedScheduleRef.current
        const schedule = cached?.day === day && cached.selectionKey === selectionKey ? cached.schedule
          : buildTvRuntimeSchedule(day, {
              enabledProviderIds,
              activeWaipuStationIds: activeWaipuStations.map((station) => station.id),
              activeJoynStationIds: activeJoynStations.map((station) => station.id),
            })
        preparedScheduleRef.current = { day, selectionKey, schedule }
        finishPerformanceSpan('tv:view-model', performanceKey, {
          dayKey,
          airingCount: schedule.airings.length,
          titleCount: schedule.titles.length,
        })
        if (index.generatedAt !== tvRuntimeIndex.generatedAt) setTvRuntimeIndex({ ...index, status: 'ready' })
        setTvSchedule((current) => current.status === 'ready' && current.dayKey === dayKey && current.airings === schedule.airings
          ? current : {
          dayKey,
          status: 'ready',
          airings: schedule.airings,
          titles: schedule.titles,
        })
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        finishPerformanceSpan('tv:day', performanceKey, { dayKey, outcome: 'error' })
        console.warn('TV-Runtime-Tag konnte nicht geladen werden.', error)
        setTvSchedule((current) => current.dayKey === dayKey && current.status === 'ready' ? current : { status: 'unavailable', airings: [], titles: [] })
      })

    return () => {
      cancelled = true
      controller.abort()
      cancelPerformanceSpan('tv:day', performanceKey, { dayKey, reason: 'superseded' })
      cancelPerformanceSpan('tv:view-model', performanceKey, { dayKey, reason: 'superseded' })
    }
  }, [
    resourceRevision,
    enabledProviderIds,
    activeJoynStationKey,
    activeJoynStations,
    activeWaipuStationKey,
    activeWaipuStations,
    joynStationCatalog?.status,
    joynStationSelectionLoading,
    stationSelectionLoading,
    tv14DaySummary.status,
    tvPeriodId,
    tvRuntimeIndex.days,
    tvRuntimeIndex.generatedAt,
    tvRuntimeIndex.status,
    tvScheduleRequested,
    waipuStationCatalog?.status,
  ])

  const tvPresentationTitles = useMemo(
    () => (Array.isArray(tvSchedule.titles) ? tvSchedule.titles : [])
      .map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [artworkOptions, tvSchedule.titles],
  )

  const modelBuilderRef = useRef(null)
  const summaryBuilderRef = useRef(null)
  if (!modelBuilderRef.current) modelBuilderRef.current = createWaipuTvViewModelBuilder()
  if (!summaryBuilderRef.current) summaryBuilderRef.current = createTv14DayRowsBuilder()
  const emptyModel = useMemo(() => buildWaipuTvViewModel({
    availableDays: combinedTvDays, selectedPeriodId: tvPeriodId, now: tvClock, includeHero: false,
  }), [combinedTvDays, tvClock, tvPeriodId])
  const buildModel = useCallback((signal) => modelBuilderRef.current({
    airings: tvSchedule.airings, titles: tvPresentationTitles, titleEntries: liveAvailabilityEntries,
    stationOrder: combinedTvStationOrder, selectedPeriodId: tvPeriodId,
    availableDays: combinedTvDays, now: tvClock, includeHero: false,
  }, { signal }), [combinedTvDays, combinedTvStationOrder, liveAvailabilityEntries, tvClock, tvPeriodId, tvPresentationTitles, tvSchedule.airings])
  const selectionScope = `${tvPeriodId}:${enabledProviderIds.join('|')}:${activeWaipuStationKey}:${activeJoynStationKey}`
  const baseTvViewModel = useAsyncModel(buildModel, selectionScope, emptyModel, 'tv:rows-model')
  const buildSummary = useCallback((signal) => tvPeriodId === '14-days' && tv14DaySummary.status === 'ready'
    ? summaryBuilderRef.current({ enabledProviderIds, entries: tv14DaySummary.entries, titles: tvPresentationTitles,
        activeWaipuStationIds: activeWaipuStations.map((station) => station.id),
        activeJoynStationIds: activeJoynStations.map((station) => station.id), artworkOptions, now: tvClock,
      }, { signal }) : Promise.resolve(EMPTY_LIST),
  [enabledProviderIds, activeJoynStations, activeWaipuStations, artworkOptions, tv14DaySummary.entries,
    tv14DaySummary.status, tvClock, tvPeriodId, tvPresentationTitles])
  const tv14DayRows = useAsyncModel(buildSummary, selectionScope, EMPTY_LIST, 'tv:summary-rows')

  const tvViewModel = useMemo(() => (
    tvPeriodId === '14-days'
      ? { ...baseTvViewModel, rows: tv14DayRows }
      : baseTvViewModel
  ), [baseTvViewModel, tv14DayRows, tvPeriodId])

  useEffect(() => {
    if (tvSchedule.status !== 'ready') return undefined
    const startedAt = performance.now()
    const detail = { periodId: tvPeriodId, rowCount: tvViewModel.rows.length }
    recordPerformanceEvent('tv:rows-committed', detail)
    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        recordPerformanceEvent('tv:rows-frame', {
          ...detail,
          durationMs: Math.round(performance.now() - startedAt),
        })
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [tvPeriodId, tvSchedule.status, tvViewModel])

  const tvHeroItems = useMemo(
    () => buildTvRuntimeHeroItems(tvRuntimeHero.entries, {
      enabledProviderIds,
      disabledWaipuStationIds,
      disabledJoynStationIds,
      now: tvClock,
    }).map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [
      artworkOptions,
      disabledJoynStationIds,
      disabledWaipuStationIds,
      enabledProviderIds,
      tvClock,
      tvRuntimeHero.entries,
    ],
  )

  const tvHeroCatalogReady = isTvPresentationReady({
    heroStatus: tvRuntimeHero.status,
    stationSelectionLoading,
    joynStationSelectionLoading,
  })

  const handleTvHeroReady = useCallback(() => {
    if (tvPosterPhaseStartedRef.current) return
    tvPosterPhaseStartedRef.current = true
    recordPerformanceEvent('tv:poster-phase:start')
    setTvScheduleRequested(true)
    onStationCatalogsRequested?.(true)
  }, [onStationCatalogsRequested])

  return (
    <TvView
      rows={tvViewModel.rows}
      heroItems={tvHeroItems}
      heroReadyEnabled={tvHeroCatalogReady}
      activationRequest={activationRequest}
      onActivationUnavailable={onActivationUnavailable}
      onHeroReady={handleTvHeroReady}
      periods={tvViewModel.periods}
      selectedPeriodId={tvViewModel.selectedPeriod.id}
      onPeriodChange={setTvPeriodId}
      status={tvScheduleRequested && tvSchedule.status === 'idle' ? 'loading' : tvSchedule.status}
      onOpen={onOpen}
    />
  )
}
