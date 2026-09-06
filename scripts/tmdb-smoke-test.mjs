import { normalizeTmdbTitle } from '../src/services/tmdb.js'

const token = process.env.TMDB_API_READ_TOKEN
const requestedType = process.env.TMDB_TEST_TYPE === 'tv' ? 'tv' : 'movie'
const requestedId = process.env.TMDB_TEST_ID || (requestedType === 'tv' ? '1399' : '11')
const language = process.env.TMDB_LANGUAGE || 'de-DE'

if (!token) {
  console.error('TMDB_API_READ_TOKEN is missing. Keep it in a server-side environment variable or GitHub Actions Secret; never expose it as a VITE_ variable.')
  process.exit(2)
}

const endpoint = new URL(`https://api.themoviedb.org/3/${requestedType}/${requestedId}`)
endpoint.searchParams.set('language', language)

try {
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`TMDB request failed with HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  const payload = await response.json()
  const normalized = normalizeTmdbTitle(payload, requestedType)

  console.log('TMDB smoke test successful.')
  console.log(JSON.stringify(normalized, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
