/**
 * Full title-scoped TV airings from the already canonical Waipu/Joyn runtime
 * day publication. This index is generated offline; a detail visit reads only
 * one bounded shard, never all 14 day files. The two-airing startup preview
 * deliberately remains unchanged.
 */
export const TV_RUNTIME_TITLE_SHARD_COUNT = 64
export const TV_RUNTIME_TITLE_KIND = 'moviehub-tv-runtime-titles'

export function tvRuntimeTitleIdentity(value) {
  const type = value?.type === 'tv' ? 'series' : value?.type ?? value?.mediaType
  const tmdbId = Number(value?.tmdbId)
  return (type === 'series' || type === 'movie') && Number.isSafeInteger(tmdbId) && tmdbId > 0
    ? { type, tmdbId, key: `${type}:${tmdbId}` } : null
}

export function tvRuntimeTitleShardKey(value) {
  const identity = tvRuntimeTitleIdentity(value)
  return identity ? String(identity.tmdbId % TV_RUNTIME_TITLE_SHARD_COUNT).padStart(2, '0') : null
}

export function buildTvRuntimeTitleShards(days, { generatedAt } = {}) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new TypeError('A valid generation is required.')
  const bins = Array.from({ length: TV_RUNTIME_TITLE_SHARD_COUNT }, () => new Map())
  for (const day of Array.isArray(days) ? days : []) {
    for (const entry of Array.isArray(day?.entries) ? day.entries : []) {
      const identity = tvRuntimeTitleIdentity(entry)
      if (!identity) continue
      const bucket = identity.tmdbId % TV_RUNTIME_TITLE_SHARD_COUNT
      if (!bins[bucket].has(identity.key)) bins[bucket].set(identity.key, {
        type: identity.type, tmdbId: identity.tmdbId, airings: [],
      })
      // Preserve complete episode references and exact provider playback routes.
      bins[bucket].get(identity.key).airings.push(...(Array.isArray(entry.airings) ? entry.airings : []))
    }
  }
  return bins.map((titles, bucket) => ({
    schemaVersion: 1,
    kind: TV_RUNTIME_TITLE_KIND,
    generatedAt,
    shard: String(bucket).padStart(2, '0'),
    count: titles.size,
    entries: [...titles.values()].map((entry) => ({
      ...entry,
      airings: entry.airings.sort((left, right) => String(left?.startTime || '').localeCompare(String(right?.startTime || ''))),
    })).sort((left, right) => (
      `${left.type}:${left.tmdbId}`.localeCompare(`${right.type}:${right.tmdbId}`)
    )),
  }))
}
