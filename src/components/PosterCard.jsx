import AgeRatingBadge from './AgeRatingBadge.jsx'
import ProviderBadges from './ProviderBadges.jsx'
import { formatTvAiringCard } from '../tv/tvAiringPresentation.js'
import { resolvePosterProviderModel } from '../providers/posterProviderModel.js'
import { useYoutubeVerifiedOffers, useYoutubeCuratedEditorialHints } from '../providers/YoutubeVerifiedOffersContext.jsx'
import { withVerifiedYoutubeTitleOffer } from '../providers/youtubeVerifiedTitlePresentation.js'
import { posterImageProps, posterSourceUrl } from '../performance/posterImages.js'

export default function PosterCard({
  item,
  onOpen,
  rank = null,
  hasMovieHub = false,
  onFocus = null,
  posterIndex = null,
  variant = 'standard',
}) {
  const youtubeVerifiedRoutes = useYoutubeVerifiedOffers()
  const youtubeCuratedHints = useYoutubeCuratedEditorialHints()
  const displayItem = withVerifiedYoutubeTitleOffer(item, youtubeVerifiedRoutes, {curatedIndex: youtubeCuratedHints})
  const posterUrl = posterSourceUrl(item)
  const posterImage = posterImageProps(item, { variant: rank ? 'top-ten' : variant })
  const hasPoster = Boolean(posterUrl)
  const tvAiring = formatTvAiringCard(item.tvAiring)
  const providerModel = resolvePosterProviderModel(displayItem, { hasMovieHub })

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
      <span className={`${hasPoster ? 'poster-art has-image' : 'poster-art'}${tvAiring ? ' has-tv-airing' : ''}`} aria-hidden="true">
        {hasPoster && (
          <img
            className="poster-image"
            src={posterImage.src}
            srcSet={posterImage.srcSet}
            sizes={posterImage.sizes}
            alt=""
            loading="lazy"
            fetchPriority="low"
            decoding="async"
          />
        )}
        {rank && <span className="top-ten-rank">{rank}</span>}
        <AgeRatingBadge value={item.ageRating} className="poster-age-rating" />
        <span className="poster-kicker-stack">
          <span className="poster-kicker">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
        </span>
        <span className="poster-copy">
          <span className="poster-title">{item.title}</span>
          <span className="poster-meta-line">
            <span className="poster-year">{item.year || '–'}</span>
            {item.tvAiringOnAir && (
              <span className="on-air-badge"><span className="on-air-dot" />ON AIR</span>
            )}
            {!item.tvAiringOnAir && item.tvAiringSoon && (
              <span className="soon-badge">BALD</span>
            )}
          </span>
          {tvAiring && (
            <span className="tv-airing-card-label">
              <strong>{tvAiring.time}</strong>
              <span>{tvAiring.stationName}</span>
            </span>
          )}
        </span>
      </span>
      {providerModel.hasAvailability && (
        <ProviderBadges model={providerModel} item={displayItem} />
      )}
    </button>
  )
}
