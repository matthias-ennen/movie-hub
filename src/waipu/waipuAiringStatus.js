export const TV_AIRING_SOON_WINDOW_MS = 2 * 60 * 60 * 1_000

export function isTvAiringOnAir(airing, now = Date.now()) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const startTime = Date.parse(airing?.startTime)
  const stopTime = Date.parse(airing?.stopTime)
  return Number.isFinite(timestamp)
    && Number.isFinite(startTime)
    && Number.isFinite(stopTime)
    && startTime <= timestamp
    && timestamp < stopTime
}

export function isTvAiringSoon(airing, now = Date.now(), windowMs = TV_AIRING_SOON_WINDOW_MS) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const startTime = Date.parse(airing?.startTime)
  return Number.isFinite(timestamp)
    && Number.isFinite(startTime)
    && timestamp < startTime
    && startTime - timestamp <= Math.max(0, Number(windowMs) || 0)
}

export function nextTvAiringTransition(airings = [], now = Date.now()) {
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now)
  const transitions = (Array.isArray(airings) ? airings : [])
    .flatMap((airing) => {
      const start = Date.parse(airing?.startTime)
      return [start - TV_AIRING_SOON_WINDOW_MS, start, Date.parse(airing?.stopTime)]
    })
    .filter((value) => Number.isFinite(value) && value > timestamp)
  return transitions.length ? Math.min(...transitions) : null
}
