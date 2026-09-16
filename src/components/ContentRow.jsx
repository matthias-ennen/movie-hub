import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import { prefetchPosterWindow } from '../performance/posterPrefetch.js'
import { limitPosterRowItems } from '../performance/posterRows.js'
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
}) {
  const { isProviderEnabled } = useProviderSelection()
  const { hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const resolvedProviderId = providerId || providerIdForRowTitle(title)
  const movieHubEnabled = isProviderEnabled('moviehub')
  const trackRef = useRef(null)
  const visibleItems = useMemo(() => limitPosterRowItems(items, variant), [items, variant])

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

  function handleTrackScroll() {
    onTrackScroll?.(trackRef.current?.scrollLeft || 0)
  }

  function handlePosterFocus(index) {
    onPosterFocus?.(index)
    prefetchPosterWindow(visibleItems, index)
  }

  return (
    <section
      className={topTen ? 'content-row top-ten-row' : 'content-row'}
      data-row-id={rowId || undefined}
      data-row-index={rowIndex ?? undefined}
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
        {visibleItems.map((item, index) => (
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
