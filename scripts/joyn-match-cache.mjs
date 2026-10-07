import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { JOYN_MATCHER_VERSION } from './joyn-tmdb-matcher.mjs'
import { writeJoynJson } from './joyn-epg-sync.mjs'

function key(candidate) {
  return createHash('sha256').update(JSON.stringify({
    version: JOYN_MATCHER_VERSION, title: candidate.title,
    secondaryTitle: candidate.secondaryTitle || null,
    description: candidate.description || null,
    duration: Date.parse(candidate.endTime) - Date.parse(candidate.startTime),
  })).digest('hex')
}

export class JoynMatchCache {
  constructor(values = {}, now = Date.now()) { this.values = values; this.now = now; this.hits = 0 }
  static async load(path, now) {
    try {
      const data = JSON.parse(await readFile(path, 'utf8'))
      if (data?.schemaVersion !== 1 || data?.kind !== 'joyn-match-cache' || !data.entries) throw new Error('Invalid Joyn match cache.')
      return new JoynMatchCache(data.entries, now)
    } catch (error) { if (error.code === 'ENOENT') return new JoynMatchCache({}, now); throw error }
  }
  get(candidate) {
    const entry = this.values[key(candidate)]
    const days = entry?.diagnostic?.decision?.status === 'matched' ? 30 : 7
    const age = this.now - Date.parse(entry?.checkedAt)
    if (!entry || !Number.isFinite(age) || age < 0 || age >= days * 86400000) return null
    this.hits += 1
    return entry.diagnostic
  }
  set(candidate, diagnostic) {
    if (diagnostic?.decision?.reason?.includes('ambiguous') || diagnostic?.decision?.status === 'ambiguous' || diagnostic?.decision?.reason?.includes('budget')
        || JSON.stringify(diagnostic.joynClassification || {}).match(/budget_exhausted|_error|"error"/)) return
    this.values[key(candidate)] = { checkedAt: new Date(this.now).toISOString(), diagnostic }
  }
  async save(path) {
    for (const [key, entry] of Object.entries(this.values)) {
      if (this.now - Date.parse(entry.checkedAt) >= 30 * 86400000) delete this.values[key]
    }
    await writeJoynJson(path, { schemaVersion: 1, kind: 'joyn-match-cache', matcherVersion: JOYN_MATCHER_VERSION, entries: this.values })
  }
}

// Cache source responses, not episode classification. Each subtitle is classified
// again against the same cached hits so one episode cannot decide another's type.
export class JoynLookupCache {
  constructor(entries = {}, now = Date.now()) { this.entries = entries; this.now = now; this.hits = 0 }
  static async load(path, now) {
    try {
      const value = JSON.parse(await readFile(path, 'utf8'))
      if (value?.kind !== 'joyn-lookup-cache' || value?.schemaVersion !== 1 || !value.entries) throw new Error('Invalid Joyn lookup cache.')
      return new JoynLookupCache(value.entries, now)
    } catch (error) { if (error.code === 'ENOENT') return new JoynLookupCache({}, now); throw error }
  }
  cacheKey(namespace, query) { return createHash('sha256').update(JSON.stringify([namespace, query])).digest('hex') }
  get(namespace, query) {
    const entry = this.entries[this.cacheKey(namespace, query)]
    const age = this.now - Date.parse(entry?.checkedAt)
    if (entry && age >= 0 && age < 7 * 86400000) { this.hits += 1; return entry.value }
    return null
  }
  set(namespace, query, value) {
    if (value && !JSON.stringify(value).match(/budget_exhausted|_error|"error"/)) {
      this.entries[this.cacheKey(namespace, query)] = { checkedAt: new Date(this.now).toISOString(), value }
    }
  }
  async lookup(namespace, query, load) {
    const cached = this.get(namespace, query)
    if (cached !== null) return cached
    const value = await load()
    this.set(namespace, query, value)
    return value
  }
  async save(path) {
    for (const [key, entry] of Object.entries(this.entries)) {
      const age = this.now - Date.parse(entry.checkedAt)
      if (!Number.isFinite(age) || age < 0 || age >= 7 * 86400000) delete this.entries[key]
    }
    await writeJoynJson(path, { kind: 'joyn-lookup-cache', schemaVersion: 1, entries: this.entries })
  }
}
