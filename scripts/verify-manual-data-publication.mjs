/**
 * Exact readback for both manual modes. The usual multi-source verifier checks
 * Waipu/Joyn/TV/YouTube, but manual thematic projections also alter the
 * canonical TMDB catalog and its broad search index.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { verifyPublicationWithBoundedConvergence } from './verify-published-data.mjs'

const ORIGIN = 'https://movie-hub-62459.web.app'
export async function verifyManualDataPublication({
  root = resolve('public'), origin = process.env.MOVIE_HUB_LIVE_URL || ORIGIN,
  mode, request = fetch,
} = {}) {
  if (!['compact','themes'].includes(mode)) throw Error('MANUAL_PUBLICATION_MODE_INVALID')
  const paths = ['catalog.json', 'search-index.json']
  if (mode === 'themes') paths.push('seasonal-discovery.json')
  const summary = []
  for (const path of paths) {
    const expected = JSON.parse(await readFile(resolve(root,path),'utf8'))
    const url = new URL('/'+path,origin)
    url.searchParams.set('readback',String(Date.now()))
    const response = await request(url,{
      headers:{Accept:'application/json'},redirect:'error',
      cache:'no-store',signal:AbortSignal.timeout(30_000),
    })
    if (!response?.ok || !String(response.headers?.get?.('content-type')||'')
      .toLowerCase().includes('application/json')) {
      throw Error('MANUAL_PUBLISH_INVALID_HOSTED_JSON: '+path)
    }
    const actual = await response.json()
    if (!isDeepStrictEqual(actual,expected)) {
      throw Error('Published generation differs from build: '+path)
    }
    summary.push({path,generatedAt:actual.generatedAt||null,
      count:actual.count??actual.uniqueCandidates??actual.titles?.length??null})
  }
  console.log(JSON.stringify({kind:'moviehub-manual-publication-verified',mode,summary}))
  return summary
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode=process.argv.find(v=>v.startsWith('--mode='))?.split('=')[1]
  verifyPublicationWithBoundedConvergence({
    verify:()=>verifyManualDataPublication({mode}),maxAttempts:12,
  }).catch(e=>{console.error(e.message);process.exitCode=1})
}
