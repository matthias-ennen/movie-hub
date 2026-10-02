import { responsiveTmdbImageProps } from '../services/tmdbImages.js'

export const POSTER_CARD_IMAGE_SIZES = '280px'

export function posterSourceUrl(item) {
  return item?.displayPosterUrl || item?.neutralPosterUrl || item?.posterUrl || null
}

export function posterImageProps(item, { variant = 'standard' } = {}) {
  const source = posterSourceUrl(item)
  if (!source) return { src: null }

  // Top-10 cards are up to 1.5× wider than normal row cards and remain on
  // the established w500 source. Standard/history/TV cards can let the
  // browser choose w342 on 1× displays and w500 on denser displays.
  if (variant === 'top-ten') return { src: source }

  return responsiveTmdbImageProps(source, {
    candidates: ['w342', 'w500'],
    fallbackSize: 'w342',
    sizes: POSTER_CARD_IMAGE_SIZES,
  })
}
