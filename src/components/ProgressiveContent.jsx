import { RESTORE_POSTER_FOCUS_EVENT, focusPosterAnchor, resolvePosterIndex } from '../navigation/posterFocus.js'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import {
  INITIAL_VISIBLE_POSTERS,
  POSTER_REVEAL_BATCH_SIZE,
  PROGRESSIVE_ROW_REQUEST_EVENT,
  initialVisibleCount,
  nextVisibleCount,
} from '../performance/progressiveRendering.js'
import { estimatePosterRowHeight, ROW_VIRTUAL_OVERSCAN } from '../performance/posterRows.js'
import { recordPerformanceEvent } from '../performance/performanceDiagnostics.js'
import {
  filterRowsByExperienceVisibility,
  inferExperiencePage,
} from '../profiles/profileExperienceRuntime.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import ContentRow from './ContentRow.jsx'
import PosterCard from './PosterCard.jsx'

function useProgressiveCount({
  total,
  ready,
  initialCount,
  batchSize,
}) {
  const [visibleCount, setVisibleCount] = useState(0)
  const sentinelRef = useRef(null)

  useEffect(() => {
    setVisibleCount((current) => {
      if (!ready) return 0
      return Math.max(current, initialVisibleCount(total, true, initialCount))
    })
  }, [initialCount, ready, total])

  const revealNext = useCallback(() => {
    setVisibleCount((current) => nextVisibleCount(current, total, batchSize))
  }, [batchSize, total])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!ready || !sentinel || visibleCount >= total) return undefined

    if (typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(revealNext, 120)
      return () => window.clearTimeout(timer)
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealNext()
    }, { rootMargin: '700px 0px' })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [ready, revealNext, total, visibleCount])

  return { visibleCount, sentinelRef }
}

function documentOffsetTop(element) {
  if (!element || typeof window === 'undefined') return 0
  return element.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop || 0)
}

export function ProgressiveRows({
  rows,
  heroReady,
  onOpen,
  className = 'rows-wrap',
  onInitialContentReady,
}) {
  const listRef = useRef(null)
  const rowStateRef = useRef(new Map())
  const lastFocusRef = useRef(null)
  const restoreFrameRef = useRef(null)
  const [, setFocusRevision] = useState(0)
  const initialReadyReportedRef = useRef(false)
  const [scrollMargin, setScrollMargin] = useState(0)
  const experiencePage = inferExperiencePage(rows, className)
  const visibleRows = useMemo(
    () => filterRowsByExperienceVisibility(rows, experiencePage),
    [experiencePage, rows],
  )
  const activeRows = heroReady ? visibleRows : []

  const rowVirtualizer = useWindowVirtualizer({
    count: activeRows.length,
    estimateSize: (index) => estimatePosterRowHeight(activeRows[index]?.variant),
    overscan: ROW_VIRTUAL_OVERSCAN,
    scrollMargin,
    getItemKey: (index) => activeRows[index]?.id || index,
  })

  const virtualItems = heroReady ? rowVirtualizer.getVirtualItems() : []
  const [admittedRows, setAdmittedRows] = useState(() => new Set())
  const requestedRowsKey = virtualItems.map((item) => item.key).join('|')
  useEffect(() => {
    const keys = virtualItems.map((item) => item.key)
    const allowed = new Set(keys)
    setAdmittedRows((current) => new Set([...current].filter((key) => allowed.has(key))))
    let frame, index = 0
    const admit = () => {
      const key = keys[index++]
      if (key !== undefined) setAdmittedRows((current) => {
        if (current.has(key)) return current
        recordPerformanceEvent('rows:admit', { pageId: experiencePage, windowIndex: index - 1 })
        return new Set([...current, key])
      })
      if (index < keys.length) frame = window.requestAnimationFrame(admit)
    }
    if (keys.length) frame = window.requestAnimationFrame(admit)
    return () => window.cancelAnimationFrame(frame)
  }, [requestedRowsKey, heroReady, experiencePage])
  const renderedVirtualItems = virtualItems.filter((item) => admittedRows.has(item.key))

  useLayoutEffect(() => {
    if (!heroReady) {
      setScrollMargin(0)
      return undefined
    }

    const updateMargin = () => setScrollMargin(documentOffsetTop(listRef.current))
    updateMargin()
    window.addEventListener('resize', updateMargin)

    let observer = null
    if (typeof ResizeObserver !== 'undefined' && listRef.current) {
      observer = new ResizeObserver(updateMargin)
      observer.observe(listRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateMargin)
      observer?.disconnect()
    }
  }, [heroReady, visibleRows.length])

  useLayoutEffect(() => {
    if (!heroReady) return undefined
    const restore = (anchor) => {
      let index = activeRows.findIndex((row) => row.id === anchor.rowId)
      if (index < 0) index = Math.max(0, Math.min(activeRows.length - 1, anchor.rowIndex))
      const row = activeRows[index]
      if (!row) return false
      const itemIndex = resolvePosterIndex(row.items, anchor.itemId, anchor.index)
      const next = { rowId: row.id, rowIndex: index, itemId: row.items[itemIndex]?.id, index: itemIndex }
      const saved = rowStateRef.current.get(row.id) || {}
      rowStateRef.current.set(row.id, { ...saved, focusIndex: itemIndex, focusId: next.itemId })
      setFocusRevision((revision) => revision + 1)
      if (!document.querySelector(`[data-row-index="${index}"]`)) rowVirtualizer.scrollToIndex(index, { align: 'center', behavior: 'auto' })
      let attempts = 0
      if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current)
      const attempt = () => {
        restoreFrameRef.current = null
        if (focusPosterAnchor(next, listRef.current)) return
        if (++attempts < 10) restoreFrameRef.current = window.requestAnimationFrame(attempt)
      }
      restoreFrameRef.current = window.requestAnimationFrame(attempt)
      return true
    }
    const handleRestore = (event) => { event.detail.handled = restore(event.detail.anchor) }
    window.addEventListener(RESTORE_POSTER_FOCUS_EVENT, handleRestore)
    const anchor = lastFocusRef.current
    if (anchor && document.activeElement === document.body && !activeRows.some((row) => row.id === anchor.rowId)) restore(anchor)
    const liveIds = new Set(activeRows.map((row) => row.id))
    for (const id of rowStateRef.current.keys()) if (!liveIds.has(id)) rowStateRef.current.delete(id)
    return () => {
      window.removeEventListener(RESTORE_POSTER_FOCUS_EVENT, handleRestore)
      if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current)
    }
  }, [activeRows, heroReady, rowVirtualizer])

  useEffect(() => {
    if (!heroReady) return undefined

    function handleRowRequest(event) {
      const currentIndex = Number(event.detail?.currentRowIndex)
      const direction = Number(event.detail?.direction) || 1
      const startIndex = Number.isInteger(currentIndex) ? currentIndex : -1
      const targetIndex = startIndex + direction
      if (targetIndex < 0 || targetIndex >= activeRows.length) return

      event.detail.handled = true
      event.detail.targetRowIndex = targetIndex
      rowVirtualizer.scrollToIndex(targetIndex, { align: 'center', behavior: 'auto' })
    }

    window.addEventListener(PROGRESSIVE_ROW_REQUEST_EVENT, handleRowRequest)
    return () => window.removeEventListener(PROGRESSIVE_ROW_REQUEST_EVENT, handleRowRequest)
  }, [activeRows.length, heroReady, rowVirtualizer])

  useEffect(() => {
    if (!heroReady || initialReadyReportedRef.current) return undefined

    const reportReady = (visibleRowCount) => {
      initialReadyReportedRef.current = true
      const detail = { visibleRowCount }
      recordPerformanceEvent('rows:first-ready', {
        pageId: experiencePage,
        visibleRowCount,
      })
      onInitialContentReady?.(detail)
    }

    if (!virtualItems.length && activeRows.length === 0) {
      reportReady(0)
      return undefined
    }
    if (!renderedVirtualItems.length) return undefined

    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        reportReady(renderedVirtualItems.length)
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [activeRows.length, experiencePage, heroReady, onInitialContentReady, renderedVirtualItems.length, virtualItems.length])

  return (
    <div
      className={className}
      aria-busy={!heroReady}
      data-progressive-rows="true"
      data-virtualized-rows="true"
      data-visible-row-count={renderedVirtualItems.length}
    >
      <div
        ref={listRef}
        className="virtualized-row-list"
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
      >
        {renderedVirtualItems.map((virtualRow) => {
          const row = activeRows[virtualRow.index]
          if (!row) return null
          let savedState = rowStateRef.current.get(row.id)
          if (!savedState?.onTrackScroll) {
            savedState = { scrollLeft: 0, focusIndex: 0, ...savedState,
              onTrackScroll: (scrollLeft) => {
                const current = rowStateRef.current.get(row.id)
                if (current) current.scrollLeft = scrollLeft
              },
              onPosterFocus: (focusIndex, focusId) => {
                const current = rowStateRef.current.get(row.id)
                if (current) { current.focusIndex = focusIndex; current.focusId = focusId }
                lastFocusRef.current = { rowId: row.id, rowIndex: current?.rowIndex ?? virtualRow.index, itemId: focusId, index: focusIndex }
              },
            }
            rowStateRef.current.set(row.id, savedState)
          }

          savedState.rowIndex = virtualRow.index

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="virtualized-row-item"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
              }}
            >
              <ContentRow
                rowId={row.id}
                rowIndex={virtualRow.index}
                title={row.title}
                items={row.items}
                onOpen={onOpen}
                providerId={row.providerId}
                variant={row.variant}
                virtualized
                initialScrollLeft={savedState.scrollLeft}
                initialFocusIndex={savedState.focusIndex}
                initialFocusId={savedState.focusId}
                onTrackScroll={savedState.onTrackScroll}
                onPosterFocus={savedState.onPosterFocus}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProgressivePosterGrid({ items, heroReady, onOpen }) {
  const { visibleCount, sentinelRef } = useProgressiveCount({
    total: items.length,
    ready: heroReady,
    initialCount: INITIAL_VISIBLE_POSTERS,
    batchSize: POSTER_REVEAL_BATCH_SIZE,
  })
  const { isProviderEnabled } = useProviderSelection()
  const { hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const movieHubEnabled = isProviderEnabled('moviehub')

  return (
    <div
      className="poster-grid"
      aria-busy={heroReady && visibleCount < items.length}
      data-visible-poster-count={visibleCount}
    >
      {items.slice(0, visibleCount).map((item) => (
        <PosterCard
          key={item.id}
          item={item}
          onOpen={onOpen}
          hasMovieHub={movieHubEnabled && hasMovieHubTitle(item)}
        />
      ))}
      {heroReady && visibleCount < items.length && (
        <div ref={sentinelRef} className="progressive-content-sentinel" aria-hidden="true" />
      )}
    </div>
  )
}
