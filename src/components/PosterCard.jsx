import { useSharedMediaPresence } from '../library/sharedMediaPresence.js'
import AgeRatingBadge from './AgeRatingBadge.jsx'
import ProviderBadges from './ProviderBadges.jsx'

export default function PosterCard({ item, onOpen }) {
  const posterUrl = item.neutralPosterUrl || item.posterUrl || null
  const hasPoster = Boolean(posterUrl)
  const hasMovieHub = useSharedMediaPresence(item)
  const providerIds = Array.isArray(item.providerIds) ? item.providerIds : []

  return (
    <button
      type="button"
      className="poster-card"
      onClick={() => onOpen(item)}
      data-focusable="true"
      aria-label={`${item.title} öffnen`}
      style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}
    >
      <span className={hasPoster ? 'poster-art has-image' : 'poster-art'} aria-hidden="true">
        {hasPoster && <img className="poster-image" src={posterUrl} alt="" loading="lazy" />}
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
