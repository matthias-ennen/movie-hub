/**
 * #336 G1e: bounded-memory, read-only structural count of the root `entries`
 * map in private Joyn matcher/response JSON caches. Does not deserialize or
 * retain programme titles, matcher decisions, response objects or cache IDs.
 * Only the two expected cache kinds and schema v1 are accepted.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

const MAX_STREAM_BYTES = 1024 * 1024 * 1024 // refuse files larger than 1 GiB
const MAX_DEPTH = 80
const MAX_ENTRIES = 1_000_000
const MAX_PRIMITIVE_BYTES = 48
const CAPTURE_BYTES = 128
const WHITE = new Set([9, 10, 13, 32])
const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+\-]?[0-9]+)?$/

function bad() { throw new TypeError('Invalid or unbounded private cache JSON structure') }
function frame(type) {
  return { type, state: type === 'object' ? 'keyOrEnd' : 'valueOrEnd', key: null }
}

/**
 * Incrementally validates JSON container/string/primitive boundaries and
 * counts completed direct properties in the designated root `entries` object.
 * No full JSON objects or cache entry keys are ever materialized.
 */
export async function countPrivateCacheEntries(path, {
  expectedKind,
  maxBytes = MAX_STREAM_BYTES,
  chunkBytes = 128 * 1024,
} = {}) {
  if (!['joyn-match-cache', 'joyn-lookup-cache'].includes(expectedKind) ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_STREAM_BYTES ||
      !Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 1024 * 1024) bad()
  let file
  try { file = await stat(path) } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (!file.isFile() || file.size > maxBytes) throw new RangeError('Private cache exceeds bounded streaming limit')

  const stack = []
  let root = null
  let entries = null
  let seenEntries = false
  let seenKind = false
  let seenVersion = false
  let kind = null
  let version = null
  let entryCount = 0
  let phase = 'root'
  let stringMode = false
  let stringPurpose = null
  let quotedBuffer = ''
  let escaped = false
  let unicodeDigitsLeft = 0
  let capture = false
  let primitive = null
  let bytesRead = 0

  function completeValue(parent) {
    if (!parent || !['value', 'awaitingChild', 'valueOrEnd', 'valueRequired'].includes(parent.state)) bad()
    if (parent === entries) {
      entryCount++
      if (entryCount > MAX_ENTRIES) throw new RangeError('Private cache has too many entries')
    }
    if (parent === root) {
      if (parent.key === 'kind') {
        if (seenKind) bad()
        seenKind = true
        if (stringPurpose !== 'kind-value') bad()
        kind = quotedBuffer
      } else if (parent.key === 'schemaVersion') {
        if (seenVersion) bad()
        seenVersion = true
        if (stringPurpose !== 'version-value' || !NUMBER.test(primitive ?? '')) bad()
        version = Number(primitive)
      } else if (parent.key === 'entries') {
        if (seenEntries || !entries ||
            !['keyOrEnd', 'commaOrEnd'].includes(entries.state)) bad()
        seenEntries = true
      }
    }
    parent.state = 'commaOrEnd'
    parent.key = null
    stringPurpose = null
    primitive = null
  }

  function push(type, parent) {
    if (stack.length >= MAX_DEPTH) throw new RangeError('Private JSON nesting exceeds bounded depth')
    const child = frame(type)
    if (!parent) {
      if (root || type !== 'object' || phase !== 'root') bad()
      root = child
      phase = 'parsing'
    } else {
      if (!['value', 'valueOrEnd', 'valueRequired'].includes(parent.state)) bad()
      if (parent === root && parent.key === 'entries') {
        if (entries || seenEntries || type !== 'object') bad()
        entries = child
      }
      parent.state = 'awaitingChild'
    }
    stack.push(child)
  }

  function close(type) {
    const completed = stack.at(-1)
    if (!completed || completed.type !== type ||
        !['keyOrEnd', 'valueOrEnd', 'commaOrEnd'].includes(completed.state)) bad()
    stack.pop()
    if (!stack.length) { phase = 'done'; return }
    const parent = stack.at(-1)
    if (parent.state !== 'awaitingChild') bad()
    completeValue(parent)
  }

  function stringStart(parent) {
    if (!parent) bad()
    if (parent.type === 'object' &&
        (parent.state === 'keyOrEnd' || parent.state === 'keyRequired')) {
      stringPurpose = parent === root ? 'root-key' : 'other-key'
    } else if (['value', 'valueOrEnd', 'valueRequired'].includes(parent.state)) {
      stringPurpose = parent === root && parent.key === 'kind' ? 'kind-value'
        : parent === root && parent.key === 'schemaVersion' ? 'invalid-version-value'
          : 'other-value'
    } else bad()
    capture = stringPurpose === 'root-key' || stringPurpose === 'kind-value'
    quotedBuffer = ''
    escaped = false
    unicodeDigitsLeft = 0
    stringMode = true
  }

  function stringFinish(parent) {
    stringMode = false
    if (stringPurpose === 'root-key' || stringPurpose === 'other-key') {
      parent.key = stringPurpose === 'root-key' ? quotedBuffer : null
      parent.state = 'colon'
      return
    }
    completeValue(parent)
  }

  function processByte(byte) {
    if (phase === 'done') { if (!WHITE.has(byte)) bad(); return }
    if (stringMode) {
      if (unicodeDigitsLeft) {
        if (!((byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 70) ||
              (byte >= 97 && byte <= 102))) bad()
        unicodeDigitsLeft--
        if (capture) quotedBuffer += String.fromCharCode(byte)
        return
      }
      if (escaped) {
        escaped = false
        if (byte === 117) unicodeDigitsLeft = 4
        else if (![34, 92, 47, 98, 102, 110, 114, 116].includes(byte)) bad()
        if (capture) quotedBuffer += String.fromCharCode(byte)
        return
      }
      if (byte === 92) { escaped = true; if (capture) quotedBuffer += '\\'; return }
      if (byte === 34) { stringFinish(stack.at(-1)); return }
      if (byte < 32) bad()
      if (capture) {
        if (quotedBuffer.length >= CAPTURE_BYTES) bad()
        quotedBuffer += String.fromCharCode(byte)
      }
      return
    }
    if (primitive !== null) {
      if (WHITE.has(byte) || byte === 44 || byte === 125 || byte === 93) {
        if (!NUMBER.test(primitive) && !['true', 'false', 'null'].includes(primitive)) bad()
        completeValue(stack.at(-1))
        processByte(byte)
        return
      }
      if (primitive.length >= MAX_PRIMITIVE_BYTES || byte < 33 || byte > 126) bad()
      primitive += String.fromCharCode(byte)
      return
    }
    if (WHITE.has(byte)) return
    if (phase === 'root') { if (byte !== 123) bad(); push('object', null); return }
    const current = stack.at(-1)
    if (!current) bad()
    if (current.state === 'colon') {
      if (byte !== 58) bad()
      current.state = 'value'
      return
    }
    if (current.state === 'commaOrEnd') {
      if (byte === 44) {
        current.state = current.type === 'object' ? 'keyRequired' : 'valueRequired'
        return
      }
      if (byte === 125 && current.type === 'object') { close('object'); return }
      if (byte === 93 && current.type === 'array') { close('array'); return }
      bad()
    }
    if (current.type === 'object' && ['keyOrEnd', 'keyRequired'].includes(current.state)) {
      if (byte === 125 && current.state === 'keyOrEnd') { close('object'); return }
      if (byte === 34) { stringStart(current); return }
      bad()
    }
    if (current.type === 'array' && current.state === 'valueOrEnd' && byte === 93) {
      close('array'); return
    }
    if (!['value', 'valueOrEnd', 'valueRequired'].includes(current.state)) bad()
    if (byte === 34) { stringStart(current); return }
    if (byte === 123) { push('object', current); return }
    if (byte === 91) { push('array', current); return }
    if (current === root && ['kind', 'entries'].includes(current.key)) bad()
    stringPurpose = current === root && current.key === 'schemaVersion'
      ? 'version-value' : 'other-primitive'
    primitive = String.fromCharCode(byte)
  }

  for await (const chunk of createReadStream(path, { highWaterMark: chunkBytes })) {
    bytesRead += chunk.length
    if (bytesRead > maxBytes) throw new RangeError('Private cache exceeds bounded streaming limit')
    for (let i = 0; i < chunk.length; i++) processByte(chunk[i])
  }
  if (phase !== 'done' || stringMode || escaped || unicodeDigitsLeft || primitive !== null ||
      !seenEntries || !seenKind || !seenVersion ||
      kind !== expectedKind || version !== 1) bad()
  return { kind, schemaVersion: 1, entries: entryCount, streamed: true }
}
