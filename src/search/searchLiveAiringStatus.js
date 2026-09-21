function titleIdentityKey(item) {
  const rawType = item?.type ?? item?.mediaType
  const type = rawType === 'series' || rawType === 'tv' ? 'series' : rawType
  const tmdbId = Number(item?.tmdbId)
  return (type === 'movie' || type === 'series') && Number.isInteger(tmdbId)
    ? `${type}:${tmdbId}`
    : null
}

export function mergeLiveAiringStatus(entries, fullTitles) {
  const statusByTitle = new Map((Array.isArray(fullTitles) ? fullTitles : [])
    .map((title) => [titleIdentityKey(title), title])
    .filter(([key]) => key))
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const liveTitle = statusByTitle.get(titleIdentityKey(entry))
    if (!liveTitle) return entry
    return {
      ...entry,
      tvAiringOnAir: Boolean(liveTitle.tvAiringOnAir),
      tvAiringSoon: Boolean(liveTitle.tvAiringSoon),
    }
  })
}
