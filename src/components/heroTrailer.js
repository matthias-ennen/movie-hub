const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/

export function selectHeroVideo(videos) {
  const candidates = Array.isArray(videos) ? videos : []
  const normalized = candidates.filter((video) => (
    video
    && String(video.site || '').toLowerCase() === 'youtube'
    && YOUTUBE_KEY_PATTERN.test(String(video.key || ''))
    && ['trailer', 'teaser'].includes(String(video.type || '').toLowerCase())
  ))

  return normalized.find((video) => String(video.type || '').toLowerCase() === 'trailer')
    || normalized.find((video) => String(video.type || '').toLowerCase() === 'teaser')
    || null
}

export function selectHeroTrailer(videos) {
  const candidates = Array.isArray(videos) ? videos : []
  return candidates.find((video) => (
    video
    && String(video.site || '').toLowerCase() === 'youtube'
    && YOUTUBE_KEY_PATTERN.test(String(video.key || ''))
    && String(video.type || '').toLowerCase() === 'trailer'
  )) || null
}
