import { resolvePosterIndex } from '../navigation/posterFocus.js'
import { recordPerformanceEvent } from '../performance/performanceDiagnostics.js'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import { prefetchPosterWindow, releasePosterPrefetch } from '../performance/posterPrefetch.js'
import {
  isProgressivePosterRow,
  limitPosterRowItems,
  nextPosterRenderCount,
  posterRenderCountForIndex,
  shouldExpandPosterWindow,
} from '../performance/posterRows.js'
import { providerIdForRowTitle } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

function ContentRow({
  rowId = null,
  rowIndex = null,
  title,
  items,
  onOpen,
  providerId = null,
  variant = 'standard',
  initialScrollLeft = 0,
  initialFocusIndex = 0,
  initialFocusId = null,
  onTrackScroll = null,
  onPosterFocus = null,
  virtualized = false,
}) {
  const { isProviderEnabled } = useProviderSelection()
  const { hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const resolvedProviderId = providerId || providerIdForRowTitle(title)
  const movieHubEnabled = isProviderEnabled('moviehub')
  const trackRef = useRef(null)
  const prefetchOwner = useId()
  const focusRef = useRef(null)
  const focusHandlerRef = useRef(null)
  const expansionFrameRef = useRef(null)
  const visibleItems = useMemo(() => limitPosterRowItems(items, variant), [items, variant])
  const restoredFocusIndex = resolvePosterIndex(visibleItems, initialFocusId, initialFocusIndex)
  const progressive = isProgressivePosterRow(variant)
  const [renderedCount, setRenderedCount] = useState(() => (
    progressive ? posterRenderCountForIndex(visibleItems.length, restoredFocusIndex, variant) : 0
  ))
  const renderedItems = progressive
    ? visibleItems.slice(0, renderedCount)
    : visibleItems

  useEffect(() => {
    if (!progressive) return
    setRenderedCount(posterRenderCountForIndex(visibleItems.length, restoredFocusIndex, variant))
  }, [restoredFocusIndex, progressive, rowId, variant, visibleItems.length])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const desired = Math.max(0, Number(initialScrollLeft) || 0)
    if (Math.abs(track.scrollLeft - desired) > 1) track.scrollLeft = desired
  }, [initialScrollLeft, rowId])

  useEffect(() => {
    if (!visibleItems.length) return
    prefetchPosterWindow(visibleItems, restoredFocusIndex, { variant, owner: prefetchOwner })
  }, [restoredFocusIndex, variant, visibleItems, prefetchOwner])

  useEffect(() => () => {
    releasePosterPrefetch(prefetchOwner)
    if (expansionFrameRef.current !== null) window.cancelAnimationFrame(expansionFrameRef.current)
  }, [prefetchOwner])

  useLayoutEffect(() => {
    const anchor = focusRef.current
    const track = trackRef.current
    if (!anchor?.owned || !track || document.visibilityState === 'hidden') return
    const active = document.activeElement
    if (active && active !== document.body && !track.contains(active)) return
    const index = resolvePosterIndex(visibleItems, anchor.id, anchor.index)
    const card = track.querySelector(`[data-poster-index="${index}"]`)
    if (!card) return
    const left = card.getBoundingClientRect().left
    if (Number.isFinite(anchor.left)) track.scrollLeft += left - anchor.left
    if (active !== card) card.focus({ preventScroll: true })
    focusRef.current = { id: visibleItems[index]?.id, index, left: card.getBoundingClientRect().left, owned: true }
    onPosterFocus?.(index, visibleItems[index]?.id)
  }, [visibleItems, onPosterFocus])

  const stablePosterFocus = useCallback((index, id) => focusHandlerRef.current?.(index, id), [])

  if (resolvedProviderId && !isProviderEnabled(resolvedProviderId)) return null

  const topTen = variant === 'top-ten'

  function expandProgressivePosters() {
    if (!progressive) return
    if (expansionFrameRef.current !== null) return
    expansionFrameRef.current = window.requestAnimationFrame(() => {
      expansionFrameRef.current = null
      setRenderedCount((current) => {
        const next = nextPosterRenderCount(current, visibleItems.length, variant)
        recordPerformanceEvent('poster:batch', { before: current, after: next, variant })
        return next
      })
    })
  }

  function handleTrackScroll() {
    const track = trackRef.current
    onTrackScroll?.(track?.scrollLeft || 0)
    if (!progressive || !track || renderedCount >= visibleItems.length) return
    const remaining = track.scrollWidth - (track.scrollLeft + track.clientWidth)
    if (remaining <= Math.max(track.clientWidth, 1)) expandProgressivePosters()
  }

  function handlePosterFocus(index, id) {
    const card = trackRef.current?.querySelector(`[data-poster-index="${index}"]`)
    focusRef.current = { id, index, left: card?.getBoundingClientRect().left, owned: true }
    onPosterFocus?.(index, id)
    prefetchPosterWindow(visibleItems, index, { variant, owner: prefetchOwner })
    if (progressive && shouldExpandPosterWindow(index, renderedCount, visibleItems.length, variant)) {
      expandProgressivePosters()
    }
  }

  focusHandlerRef.current = handlePosterFocus

  return (
    <section
      className={topTen ? 'content-row top-ten-row' : 'content-row'}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && focusRef.current) focusRef.current.owned = false
      }}
      data-row-id={rowId || undefined}
      data-row-index={rowIndex ?? undefined}
      style={virtualized ? { marginBottom: 0, paddingBottom: '2.4rem' } : undefined}
    >
      <div className="row-heading">
        <h2>{title}</h2>
        <span>{visibleItems.length} Titel</span>
      </div>
      <div
        ref={trackRef}
        className={topTen ? 'poster-track top-ten-track' : 'poster-track'}
        onScroll={handleTrackScroll}
      >
        {renderedItems.map((item, index) => (
          <PosterCard
            item={item}
            onOpen={onOpen}
            key={item.id}
            rank={topTen ? index + 1 : null}
            posterIndex={index}
            variant={variant}
            onFocus={stablePosterFocus}
            hasMovieHub={movieHubEnabled && hasMovieHubTitle(item)}
          />
        ))}
      </div>
    </section>
  )
}

export default memo(ContentRow)
