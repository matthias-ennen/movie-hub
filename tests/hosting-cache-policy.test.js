import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const firebase = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'))

function cacheControl(source) {
  const entry = firebase.hosting.headers.find((item) => item.source === source)
  return entry?.headers?.find((header) => header.key.toLowerCase() === 'cache-control')?.value ?? null
}

describe('Firebase Hosting cache contract', () => {
  it('never caches the HTML app shell across deployments', () => {
    expect(cacheControl('/index.html')).toBe('no-store')
  })

  it('caches Vite content-hashed assets immutably', () => {
    expect(cacheControl('/assets/**')).toBe('public, max-age=31536000, immutable')
  })

  it('keeps independently regenerated runtime JSON fresh', () => {
    for (const source of [
      '/catalog.json',
      '/search-index.json',
      '/search-details/**',
      '/series-details/**',
      '/tv-runtime/**',
      '/waipu-live/**',
      '/joyn-live/**',
      '/data-status.json',
    ]) {
      expect(cacheControl(source), source).toBe('no-store')
    }
  })

  it('keeps the SPA rewrite after the cache header contract', () => {
    expect(firebase.hosting.rewrites).toContainEqual({ source: '**', destination: '/index.html' })
  })
})
