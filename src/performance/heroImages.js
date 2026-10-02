import { responsiveTmdbImageProps } from '../services/tmdbImages.js'

export const HERO_IMAGE_SIZES = '(max-width: 760px) 100vw, 780px'

export function heroBackdropSourceUrl(item) {
  return item?.displayHeroBackdropUrl || item?.backdropUrl || null
}

export function heroImageProps(item) {
  const source = heroBackdropSourceUrl(item)
  if (!source) return { src: null }

  return responsiveTmdbImageProps(source, {
    candidates: ['w780', 'w1280'],
    fallbackSize: 'w780',
    sizes: HERO_IMAGE_SIZES,
  })
}
