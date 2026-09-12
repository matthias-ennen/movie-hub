import { useCallback, useEffect, useRef, useState } from 'react'
import {
  INITIAL_VISIBLE_POSTERS,
  INITIAL_VISIBLE_ROWS,
  POSTER_REVEAL_BATCH_SIZE,
  PROGRESSIVE_ROW_REQUEST_EVENT,
  ROW_REVEAL_BATCH_SIZE,
  initialVisibleCount,
  nextVisibleCount,
} from '../performance/progressiveRendering.js'
import ContentRow from './ContentRow.jsx'
import PosterCard from './PosterCard.jsx'

function useProgressiveCount({
  total,
  ready,
  initialCount,
  batchSize,
  requestEvent = null,
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
    if (!requestEvent || !ready) return undefined

    function handleRequest(event) {
      if (visibleCount >= total) return
      event.detail.handled = true
      revealNext()
    }

    window.addEventListener(requestEvent, handleRequest)
    return () => window.removeEventListener(requestEvent, handleRequest)
  }, [ready, requestEvent, revealNext, total, visibleCount])

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

export function ProgressiveRows({
  rows,
  heroReady,
  onOpen,
  className = 'rows-wrap',
  onInitialContentReady,
}) {
  const { visibleCount, sentinelRef } = useProgressiveCount({
    total: rows.length,
    ready: heroReady,
    initialCount: INITIAL_VISIBLE_ROWS,
    batchSize: ROW_REVEAL_BATCH_SIZE,
    requestEvent: PROGRESSIVE_ROW_REQUEST_EVENT,
  })
  const initialReadyReportedRef = useRef(false)

  useEffect(() => {
    if (!heroReady || initialReadyReportedRef.current || !onInitialContentReady) return undefined

    const expectedInitialRows = Math.min(INITIAL_VISIBLE_ROWS, rows.length)
    if (visibleCount < expectedInitialRows) return undefined

    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        initialReadyReportedRef.current = true
        onInitialContentReady({ visibleRowCount: visibleCount })
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [heroReady, onInitialContentReady, rows.length, visibleCount])

  return (
    <div
      className={className}
      aria-busy={heroReady && visibleCount < rows.length}
      data-progressive-rows="true"
      data-visible-row-count={visibleCount}
    >
      {rows.slice(0, visibleCount).map((row) => (
        <ContentRow key={row.id} title={row.title} items={row.items} onOpen={onOpen} />
      ))}
      {heroReady && visibleCount < rows.length && (
        <div ref={sentinelRef} className="progressive-content-sentinel" aria-hidden="true" />
      )}
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

  return (
    <div
      className="poster-grid"
      aria-busy={heroReady && visibleCount < items.length}
      data-visible-poster-count={visibleCount}
    >
      {items.slice(0, visibleCount).map((item) => (
        <PosterCard key={item.id} item={item} onOpen={onOpen} />
      ))}
      {heroReady && visibleCount < items.length && (
        <div ref={sentinelRef} className="progressive-content-sentinel" aria-hidden="true" />
      )}
    </div>
  )
}
