const SUPPORTED_AGE_RATINGS = new Set([0, 6, 12, 16, 18])

export function normalizeAgeRating(value) {
  const rating = Number(value)
  return SUPPORTED_AGE_RATINGS.has(rating) ? rating : null
}

export default function AgeRatingBadge({ value, className = '' }) {
  const rating = normalizeAgeRating(value)
  if (rating === null) return null

  return (
    <span
      className={`age-rating-badge age-rating-${rating} ${className}`.trim()}
      aria-label={`Altersfreigabe ab ${rating} Jahren`}
      title={`Ab ${rating} Jahren`}
    >
      {rating}
    </span>
  )
}
