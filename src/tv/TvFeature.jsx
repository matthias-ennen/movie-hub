import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  nextTvAiringTransition,
  tvDayKey,
} from '../waipu/waipuTvCatalog.js'
import { buildTv14DayRows, loadTv14DaySummary } from './tv14DaySummary.js'
import {
  buildTvRuntimeHeroItems,
  buildTvRuntimeSchedule,
  loadTvRuntimeDay,
  loadTvRuntimeHero,
  loadTvRuntimeIndex,
} from './tvRuntimeClient.js'

export default function TvFeature({
  waipuStationCatalog,
  joynStationCatalog,
  disabledWaipuStationIds = [],
  disabledJoynStationIds = [],
  orderWaipuStations,
  orderJoynStations,
  stationSelectionLoading = true,
  joynStationSelectionLoading = true,
  liveAvailabilityEntries = [],
  artworkOptions = {},
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
  const [tvClock, setTvClock] = useState(() => Date.now())
  const [tvPeriodId, setTvPeriodId] = useState(() => `day:${tvDayKey(Date.now())}`)
  const tvPerformanceSequenceRef = useRef(0)
  const tvRuntimeHeroRequestRef = useRef(null)
  const tvPosterPhaseStartedRef = useRef(false)

  useEffect(() => () => {
    onStationCatalogsRequested?.(false)
  }, [onStationCatalogsRequested])

  useEffect(() => {
    if (tvRuntimeHero.status === 'ready' || tvRuntimeHeroRequestRef.current) return undefined

    const controller = new AbortController()
    tvRuntimeHeroRequestRef.current = controller
    setTvRuntimeHero((current) => ({ ...current, status: 'loading' }))
    startPerformanceSpan('tv:hero-snapshot', 'runtime')

    loadTvRuntimeHero({ signal: controller.signal })
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
        setTvRuntimeHero({ status: 'unavailable', generatedAt: null, entries: [] })
        finishPerformanceSpan('tv:hero-snapshot', 'runtime', { outcome: 'error' })
      })
      .finally(() => {
        if (tvRuntimeHeroRequestRef.current === controller) {
          tvRuntimeHeroRequestRef.current = null
        }
      })

    return () => {
      if (tvRuntimeHeroRequestRef.current !== controller) return
      controller.abort()
      tvRuntimeHeroRequestRef.current = null
      setTvRuntimeHero((current) => (
        current.status === 'loading'
          ? { ...current, status: 'idle' }
          : current
      ))
      cancelPerformanceSpan('tv:hero-snapshot', 'runtime', { reason: 'view-left' })
    }
  }, [tvRuntimeHero.status])

  useEffect(() => {
    if (!tvScheduleRequested) return undefined
    if (tvRuntimeIndex.status === 'ready'
        || tvRuntimeIndex.status === 'loading'
        || tvRuntimeIndex.status === 'unavailable') return undefined

    setTvRuntimeIndex((current) => ({ ...current, status: 'loading' }))
    startPerformanceSpan('tv:index', 'runtime')
    loadTvRuntimeIndex()
      .then((index) => {
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
        finishPerformanceSpan('tv:index', 'runtime', { outcome: 'error' })
        console.warn('TV-Runtime-Index konnte nicht geladen werden.', error)
        setTvRuntimeIndex({
          status: 'unavailable',
          generatedAt: null,
          providers: [],
          days: [],
        })
      })

    return undefined
  }, [tvRuntimeIndex.status, tvScheduleRequested])

  const activeWaipuStations = useMemo(() => {
    const disabled = new Set(disabledWaipuStationIds)
    const stations = Array.isArray(waipuStationCatalog?.stations) ? waipuStationCatalog.stations : []
    return (typeof orderWaipuStations === 'function' ? orderWaipuStations(stations) : stations)
      .filter((station) => !disabled.has(station.id))
  }, [disabledWaipuStationIds, orderWaipuStations, waipuStationCatalog?.stations])
  const activeWaipuStationKey = activeWaipuStations.map((station) => station.id).join('|')

  const activeJoynStations = useMemo(() => {
    const disabled = new Set(disabledJoynStationIds)
    const stations = Array.isArray(joynStationCatalog?.stations) ? joynStationCatalog.stations : []
    return (typeof orderJoynStations === 'function' ? orderJoynStations(stations) : stations)
      .filter((station) => !disabled.has(station.id))
  }, [disabledJoynStationIds, joynStationCatalog?.stations, orderJoynStations])
  const activeJoynStationKey = activeJoynStations.map((station) => station.id).join('|')

  const combinedTvDays = useMemo(
    () => tvRuntimeIndex.status === 'ready' ? tvRuntimeIndex.days : [],
    [tvRuntimeIndex.days, tvRuntimeIndex.status],
  )
  const combinedTvStationOrder = useMemo(() => [...new Set([
    ...activeWaipuStations.map((station) => station.id),
    ...activeJoynStations.map((station) => station.canonicalId || `joyn.${station.id}`),
  ])], [activeJoynStations, activeWaipuStations])

  useEffect(() => {
    if (!tvScheduleRequested || tvPeriodId !== '14-days') return undefined
    if (tv14DaySummary.status === 'ready') return undefined
    let cancelled = false
    const controller = new AbortController()
    setTv14DaySummary((current) => ({ ...current, status: 'loading' }))
    startPerformanceSpan('tv:14-day', 'summary')
    loadTv14DaySummary({ signal: controller.signal })
      .then((summary) => {
        if (cancelled) return
        finishPerformanceSpan('tv:14-day', 'summary', { entryCount: summary.entries.length })
        setTv14DaySummary({ status: 'ready', entries: summary.entries })
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        finishPerformanceSpan('tv:14-day', 'summary', { outcome: 'error' })
        console.warn('14-Tage-TV-Summary konnte nicht geladen werden.', error)
        setTv14DaySummary({ status: 'unavailable', entries: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
      cancelPerformanceSpan('tv:14-day', 'summary', { reason: 'superseded' })
    }
  }, [tv14DaySummary.status, tvPeriodId, tvScheduleRequested])

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
    setTvSchedule({ status: 'loading', airings: [], titles: [] })
    startPerformanceSpan('tv:day', performanceKey, { dayKey })
    loadTvRuntimeDay(dayKey, {
      generation: tvRuntimeIndex.generatedAt,
      signal: controller.signal,
    })
      .then((day) => {
        if (cancelled) return
        finishPerformanceSpan('tv:day', performanceKey, {
          dayKey,
          entryCount: day.entries.length,
        })
        startPerformanceSpan('tv:view-model', performanceKey, { dayKey })
        const schedule = buildTvRuntimeSchedule(day, {
          activeWaipuStationIds: activeWaipuStations.map((station) => station.id),
          activeJoynStationIds: activeJoynStations.map((station) => station.id),
        })
        finishPerformanceSpan('tv:view-model', performanceKey, {
          dayKey,
          airingCount: schedule.airings.length,
          titleCount: schedule.titles.length,
        })
        setTvClock(Date.now())
        setTvSchedule({
          status: 'ready',
          airings: schedule.airings,
          titles: schedule.titles,
        })
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        finishPerformanceSpan('tv:day', performanceKey, { dayKey, outcome: 'error' })
        console.warn('TV-Runtime-Tag konnte nicht geladen werden.', error)
        setTvSchedule({ status: 'unavailable', airings: [], titles: [] })
      })

    return () => {
      cancelled = true
      controller.abort()
      cancelPerformanceSpan('tv:day', performanceKey, { dayKey, reason: 'superseded' })
      cancelPerformanceSpan('tv:view-model', performanceKey, { dayKey, reason: 'superseded' })
    }
  }, [
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

  useEffect(() => {
    if (!tvScheduleRequested || tvSchedule.status !== 'ready') return undefined
    const nextTransition = nextTvAiringTransition(tvSchedule.airings, tvClock)
    if (!Number.isFinite(nextTransition)) return undefined
    const timeout = window.setTimeout(
      () => setTvClock(Date.now()),
      Math.max(0, Math.min(2_147_483_647, nextTransition - Date.now() + 1_000)),
    )
    return () => window.clearTimeout(timeout)
  }, [tvClock, tvSchedule.airings, tvSchedule.status, tvScheduleRequested])

  const tvPresentationTitles = useMemo(
    () => (Array.isArray(tvSchedule.titles) ? tvSchedule.titles : [])
      .map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [artworkOptions, tvSchedule.titles],
  )

  const baseTvViewModel = useMemo(() => buildWaipuTvViewModel({
    airings: tvSchedule.airings,
    titles: tvPresentationTitles,
    titleEntries: liveAvailabilityEntries,
    stationOrder: combinedTvStationOrder,
    selectedPeriodId: tvPeriodId,
    availableDays: combinedTvDays,
    now: tvClock,
  }), [
    combinedTvDays,
    combinedTvStationOrder,
    liveAvailabilityEntries,
    tvClock,
    tvPeriodId,
    tvPresentationTitles,
    tvSchedule.airings,
  ])

  const tv14DayRows = useMemo(() => (
    tvPeriodId === '14-days' && tv14DaySummary.status === 'ready'
      ? buildTv14DayRows({
          entries: tv14DaySummary.entries,
          titles: tvPresentationTitles,
          activeWaipuStationIds: activeWaipuStations.map((station) => station.id),
          activeJoynStationIds: activeJoynStations.map((station) => station.id),
          artworkOptions,
          now: tvClock,
        })
      : []
  ), [
    activeJoynStationKey,
    activeWaipuStationKey,
    artworkOptions,
    tv14DaySummary.entries,
    tv14DaySummary.status,
    tvClock,
    tvPeriodId,
    tvPresentationTitles,
  ])

  const tvViewModel = useMemo(() => (
    tvPeriodId === '14-days'
      ? { ...baseTvViewModel, rows: tv14DayRows }
      : baseTvViewModel
  ), [baseTvViewModel, tv14DayRows, tvPeriodId])

  const tvHeroItems = useMemo(
    () => buildTvRuntimeHeroItems(tvRuntimeHero.entries, {
      disabledWaipuStationIds,
      disabledJoynStationIds,
      now: tvClock,
    }).map((item) => resolvePresentationArtwork(item, artworkOptions)),
    [
      artworkOptions,
      disabledJoynStationIds,
      disabledWaipuStationIds,
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
