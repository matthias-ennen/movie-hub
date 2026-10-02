export const TV_TIME_ZONE = 'Europe/Berlin'
export const TV_PRIME_TIME_START_MINUTE_OF_DAY = 20 * 60 + 15
export const TV_PRIME_TIME_END_MINUTE_OF_DAY = 23 * 60

function localMinuteOfDay(value, timeZone = TV_TIME_ZONE) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return hour * 60 + minute
}

export function isPrimeTimeStart(value, timeZone = TV_TIME_ZONE) {
  const minuteOfDay = localMinuteOfDay(value, timeZone)
  return Number.isInteger(minuteOfDay)
    && minuteOfDay >= TV_PRIME_TIME_START_MINUTE_OF_DAY
    && minuteOfDay < TV_PRIME_TIME_END_MINUTE_OF_DAY
}
