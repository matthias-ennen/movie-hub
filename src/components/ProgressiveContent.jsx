import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import {
  INITIAL_VISIBLE_POSTERS,
  POSTER_REVEAL_BATCH_SIZE,
  PROGRESSIVE_ROW_REQUEST_EVENT,
  initialVisibleCount,
  nextVisibleCount,
} from '../performance/progressiveRendering.js'
import { estimatePosterRowHeight, ROW_VIRTUAL_OVERSCAN } from '../performance/posterRows.js'
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
  const initialReadyReportedRef = useRef(false)
  const [scrollMargin, setScrollMargin] = useState(0)
  const activeRows = heroReady ? rows : []

  const rowVirtualizer = useWindowVirtualizer({
    count: activeRows.length,
    estimateSize: (index) => estimatePosterRowHeight(activeRows[index]?.variant),
    overscan: ROW_VIRTUAL_OVERSCAN,
    scrollMargin,
    getItemKey: (index) => activeRows[index]?.id || index,
  })

  const virtualItems = heroReady ? rowVirtualizer.getVirtualItems() : []

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
  }, [heroReady, rows.length])

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
    if (!heroReady || initialReadyReportedRef.current || !onInitialContentReady || !virtualItems.length) return undefined

    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        initialReadyReportedRef.current = true
        onInitialContentReady({ visibleRowCount: virtualItems.length })
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [heroReady, onInitialContentReady, virtualItems.length])

  return (
    <div
      className={className}
      aria-busy={!heroReady}
      data-progressive-rows="true"
      data-virtualized-rows="true"
      data-visible-row-count={virtualItems.length}
    >
      <div
        ref={listRef}
        className="virtualized-row-list"
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
      >
        {virtualItems.map((virtualRow) => {
          const row = activeRows[virtualRow.index]
          if (!row) return null
          const savedState = rowStateRef.current.get(row.id) || { scrollLeft: 0, focusIndex: 0 }

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
                onTrackScroll={(scrollLeft) => {
                  const previous = rowStateRef.current.get(row.id) || {}
                  rowStateRef.current.set(row.id, { ...previous, scrollLeft })
                }}
                onPosterFocus={(focusIndex) => {
                  const previous = rowStateRef.current.get(row.id) || {}
                  rowStateRef.current.set(row.id, { ...previous, focusIndex })
                }}
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
