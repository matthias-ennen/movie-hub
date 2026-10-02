# Hosting cache contract

Movie Hub separates deploy-versioned frontend assets from mutable runtime data.

## App shell

`/index.html` uses `Cache-Control: no-store`.

The Android/Fire-TV shell deliberately requests the hosted entry document on every cold start/retry. A stale HTML shell must never reference an older chunk set after a deploy.

## Hashed frontend assets

`/assets/**` uses:

`Cache-Control: public, max-age=31536000, immutable`

Vite emits content-hashed JavaScript/CSS filenames. A changed asset therefore receives a new URL, so long-lived immutable caching is safe and reduces repeated Fire-TV downloads.

## Mutable runtime JSON

The following generated data remains `no-store`:

- `/catalog.json`
- `/search-index.json`
- `/search-details/**`
- `/series-details/**`
- `/tv-runtime/**`
- `/waipu-live/**`
- `/joyn-live/**`
- `/data-status.json`

These files are regenerated independently from the frontend bundle. Reusing an older CDN/browser copy can produce inconsistent provider, TV, search or metadata state, so freshness wins over long-lived caching.

## Rule

Only content-addressed/hash-versioned assets get an immutable cache lifetime. Mutable generated data must either stay non-cacheable or receive a future explicit generation/versioned URL contract before stronger caching is introduced.
