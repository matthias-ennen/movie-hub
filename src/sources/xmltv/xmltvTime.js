/**
 * XMLTV absolute time, for both the G0 read-only probe and G1 parser.
 *
 * XMLTV timestamps may specify YYYYMMDDHHMM[SS] +HHMM/-HHMM (or Z).
 * No-offset timestamps remain distinguishable at the candidate level; the
 * parser treats them as UTC rather than silently using the CI machine zone.
 */
export function parseXmltvTimestamp(raw) {
  const match = String(raw ?? '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2})(\d{2})|Z)?$/)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '00', sign, tzHour = '00', tzMinute = '00'] = match
  const [y, mo, d, h, mi, s] = [year, month, day, hour, minute, second].map(Number)
  if (+tzHour > 23 || +tzMinute > 59 || y < 1970 || y > 2100) return null
  const utc = Date.UTC(y, mo - 1, d, h, mi, s)
  const probe = new Date(utc)
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 ||
      probe.getUTCDate() !== d || probe.getUTCHours() !== h ||
      probe.getUTCMinutes() !== mi || probe.getUTCSeconds() !== s) return null
  const offsetMinutes = sign ? (sign === '+' ? 1 : -1) * (+tzHour * 60 + +tzMinute) : 0
  return utc - offsetMinutes * 60_000
}

export function xmltvTimestampHasOffset(raw) {
  return /(?:[+-]\d{4}|Z)\s*$/.test(String(raw ?? ''))
}
