import { useEffect, useRef, useState } from 'react'
import { useSharedMediaPresence } from '../library/sharedMediaPresence.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import AgeRatingBadge from './AgeRatingBadge.jsx'
import ProviderBadges from './ProviderBadges.jsx'

export default function PosterCard({ item, onOpen, rank = null }) {
  const cardRef = useRef(null)
  const [nearViewport, setNearViewport] = useState(false)
  const posterUrl = item.displayPosterUrl || item.neutralPosterUrl || item.posterUrl || null
  const hasPoster = Boolean(posterUrl)
  const { isProviderEnabled } = useProviderSelection()
  const movieHubEnabled = isProviderEnabled('moviehub')
  const hasMovieHub = useSharedMediaPresence(item, nearViewport && movieHubEnabled)
  const providerIds = Array.isArray(item.providerIds) ? item.providerIds : []

  useEffect(() => {
    const card = cardRef.current
    if (!card) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setNearViewport(true)
      observer.disconnect()
    }, { rootMargin: '600px 800px' })
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  return (
    <button
      ref={cardRef}
      type="button"
      className={rank ? 'poster-card top-ten-poster-card' : 'poster-card'}
      onClick={() => onOpen(item, posterUrl)}
      data-focusable="true"
      data-top-ten-rank={rank || undefined}
      aria-label={rank ? `Platz ${rank}: ${item.title} öffnen` : `${item.title} öffnen`}
      style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}
    >
      <span className={hasPoster ? 'poster-art has-image' : 'poster-art'} aria-hidden="true">
        {hasPoster && <img className="poster-image" src={posterUrl} alt="" loading="lazy" fetchPriority="low" decoding="async" />}
        {rank && <span className="top-ten-rank">{rank}</span>}
        <AgeRatingBadge value={item.ageRating} className="poster-age-rating" />
        <span className="poster-kicker">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
        <span className="poster-copy">
          <span className="poster-title">{item.title}</span>
          <span className="poster-year">{item.year || '–'}</span>
        </span>
      </span>
      {(hasMovieHub || providerIds.length > 0) && (
        <ProviderBadges providerIds={providerIds} maxVisible={3} includeMovieHub={hasMovieHub} />
      )}
    </button>
  )
}
