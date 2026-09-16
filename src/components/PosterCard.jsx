import AgeRatingBadge from './AgeRatingBadge.jsx'
import ProviderBadges from './ProviderBadges.jsx'

export default function PosterCard({ item, onOpen, rank = null, hasMovieHub = false, onFocus = null, posterIndex = null }) {
  const posterUrl = item.displayPosterUrl || item.neutralPosterUrl || item.posterUrl || null
  const hasPoster = Boolean(posterUrl)
  const providerIds = Array.isArray(item.providerIds) ? item.providerIds : []

  return (
    <button
      type="button"
      className={rank ? 'poster-card top-ten-poster-card' : 'poster-card'}
      onClick={() => onOpen(item, posterUrl)}
      onFocus={onFocus || undefined}
      data-focusable="true"
      data-poster-index={posterIndex ?? undefined}
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
