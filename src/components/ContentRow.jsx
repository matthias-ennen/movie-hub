import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import { prefetchPosterWindow } from '../performance/posterPrefetch.js'
import {
  limitPosterRowItems,
  nextTvPosterRenderCount,
  shouldExpandTvPosterWindow,
  tvPosterRenderCountForIndex,
} from '../performance/posterRows.js'
import { providerIdForRowTitle } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

export default function ContentRow({
  rowId = null,
  rowIndex = null,
  title,
  items,
  onOpen,
  providerId = null,
  variant = 'standard',
  initialScrollLeft = 0,
  initialFocusIndex = 0,
  onTrackScroll = null,
  onPosterFocus = null,
  virtualized = false,
}) {
  const { isProviderEnabled } = useProviderSelection()
  const { hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const resolvedProviderId = providerId || providerIdForRowTitle(title)
  const movieHubEnabled = isProviderEnabled('moviehub')
  const trackRef = useRef(null)
  const visibleItems = useMemo(() => limitPosterRowItems(items, variant), [items, variant])
  const [tvRenderedCount, setTvRenderedCount] = useState(() => (
    variant === 'tv' ? tvPosterRenderCountForIndex(visibleItems.length, initialFocusIndex) : 0
  ))
  const renderedItems = variant === 'tv'
    ? visibleItems.slice(0, tvRenderedCount)
    : visibleItems

  useEffect(() => {
    if (variant !== 'tv') return
    setTvRenderedCount(tvPosterRenderCountForIndex(visibleItems.length, initialFocusIndex))
  }, [initialFocusIndex, rowId, variant, visibleItems.length])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const desired = Math.max(0, Number(initialScrollLeft) || 0)
    if (Math.abs(track.scrollLeft - desired) > 1) track.scrollLeft = desired
  }, [initialScrollLeft, rowId])

  useEffect(() => {
    if (!visibleItems.length) return
    prefetchPosterWindow(visibleItems, Math.max(0, Number(initialFocusIndex) || 0))
  }, [initialFocusIndex, visibleItems])

  if (resolvedProviderId && !isProviderEnabled(resolvedProviderId)) return null

  const topTen = variant === 'top-ten'

  function expandTvPosters() {
    if (variant !== 'tv') return
    setTvRenderedCount((current) => nextTvPosterRenderCount(current, visibleItems.length))
  }

  function handleTrackScroll() {
    const track = trackRef.current
    onTrackScroll?.(track?.scrollLeft || 0)
    if (variant !== 'tv' || !track || tvRenderedCount >= visibleItems.length) return
    const remaining = track.scrollWidth - (track.scrollLeft + track.clientWidth)
    if (remaining <= Math.max(track.clientWidth, 1)) expandTvPosters()
  }

  function handlePosterFocus(index) {
    onPosterFocus?.(index)
    prefetchPosterWindow(visibleItems, index)
    if (variant === 'tv' && shouldExpandTvPosterWindow(index, tvRenderedCount, visibleItems.length)) {
      expandTvPosters()
    }
  }

  return (
    <section
      className={topTen ? 'content-row top-ten-row' : 'content-row'}
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
            onFocus={() => handlePosterFocus(index)}
            hasMovieHub={movieHubEnabled && hasMovieHubTitle(item)}
          />
        ))}
      </div>
    </section>
  )
}
