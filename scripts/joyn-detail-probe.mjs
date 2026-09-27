import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const JOYN_BASE = 'https://www.joyn.de'
const AUTH_URL = 'https://auth.joyn.de/auth/anonymous'
const GRAPHQL_URL = 'https://api.joyn.de/graphql'
const OBSERVED_PUBLIC_WEBCLIENT_KEY = '4f0fd9f18abbe3cf0e87fdb556bc39c8'
const TARGETS = (process.env.JOYN_DETAIL_PROBE_TITLES || 'Das singende, klingende Bäumchen')
  .split('|').map((value) => value.trim()).filter(Boolean)

const FULL_EPG_QUERY = `query LiveChannelsAndEPG {
  liveStreams(filterLivestreamsTypes: [LINEAR], first: 5000, offset: 0, liveStreamGroupFilter: DEFAULT) {
    id title
    brand { id title brandCode }
    epgEvents {
      startDate endDate
      program {
        __typename
        ... on EpgEntry { id title secondaryTitle startDate endDate images { id type url } }
        ... on Movie { id title path productionYear description genres { name } images { type url } video { id duration } ageRating { minAge } }
        ... on Episode { id title path number season { number } series { id title } video { id duration } }
      }
    }
  }
}`

const RICH_SEARCH_QUERY = `query JoynDetailProbe($term: String!) {
  search(term: $term, first: 20, offset: 0) {
    results {
      __typename
      ... on EpgEntry {
        id title secondaryTitle startDate endDate
        images { id type url }
        livestream { id gracenoteId brand { id title } }
      }
      ... on Movie {
        id title path productionYear description
        genres { name }
        images { type url }
        video { id duration }
        ageRating { minAge description ratingSystem }
      }
      ... on Series {
        id title description numberOfSeasons
        genres { name }
        images { type url }
        ageRating { minAge description ratingSystem }
      }
    }
  }
}`

function headers() {
  return {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    origin: JOYN_BASE,
    referer: JOYN_BASE + '/',
    'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  }
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase('de-DE')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

async function discoverApiKey() {
  try {
    const page = await fetch(JOYN_BASE, { headers: headers() })
    if (!page.ok) return null
    const html = await page.text()
    const patterns = [
      /["']x-api-key["']\s*[:=]\s*["']([a-f0-9]{32})["']/i,
      /(?:["'])?xApiKey(?:["'])?\s*[:=]\s*["']([a-f0-9]{32})["']/i,
      /(?:["'])?graphqlApiKey(?:["'])?\s*[:=]\s*["']([a-f0-9]{32})["']/i,
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(html)
      if (match?.[1]) return match[1]
    }
  } catch {}
  return null
}

async function anonymousToken() {
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: 'web', client_name: 'joyn-web' }),
  })
  if (!response.ok) throw new Error(`Joyn auth failed: HTTP ${response.status}`)
  const body = await response.json()
  const token = body?.access_token || body?.accessToken
  if (!token) throw new Error('Joyn auth returned no token.')
  return token
}


async function probeResolver({ token, apiKey, name, programId }) {
  const query = `query ResolverProbe($id: ID!) { ${name}(id: $id) { __typename ... on EpgEntry { id title secondaryTitle startDate endDate } ... on Movie { id title path productionYear } ... on Series { id title } } }`
  const result = await gql({
    token,
    apiKey,
    operationName: 'ResolverProbe',
    query,
    variables: { id: programId },
  })
  return {
    name,
    ok: result.ok && !result.body?.errors?.length,
    httpStatus: result.status,
    errors: result.body?.errors || [],
    data: result.body?.data || null,
  }
}

async function gql({ token, apiKey, operationName, query, variables = null }) {
  const params = new URLSearchParams()
  params.set('operationName', operationName)
  params.set('enable_user_location', 'true')
  params.set('watch_assistant_variant', 'true')
  if (variables) params.set('variables', JSON.stringify(variables))
  params.set('query', query)
  const response = await fetch(GRAPHQL_URL + '?' + params.toString(), {
    headers: {
      ...headers(),
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'joyn-platform': 'web',
      'joyn-country': 'DE',
      'joyn-distribution-tenant': 'JOYN',
      'joyn-client-version': '5.1370.0',
    },
  })
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch {}
  return { ok: response.ok, status: response.status, body, text: text.slice(0, 2000) }
}

function compactProgram(stream, event) {
  const p = event?.program || {}
  return {
    channelId: stream?.id || null,
    channelTitle: stream?.title || null,
    brandId: stream?.brand?.id || null,
    brandTitle: stream?.brand?.title || null,
    typename: p?.__typename || null,
    programId: p?.id || null,
    title: p?.title || null,
    secondaryTitle: p?.secondaryTitle || null,
    startDate: p?.startDate || event?.startDate || null,
    endDate: p?.endDate || event?.endDate || null,
    path: p?.path || null,
    productionYear: p?.productionYear ?? null,
    description: p?.description || null,
    genres: Array.isArray(p?.genres) ? p.genres.map((g) => g?.name).filter(Boolean) : [],
    duration: p?.video?.duration ?? null,
    ageRating: p?.ageRating?.minAge ?? null,
    seasonNumber: p?.season?.number ?? null,
    episodeNumber: p?.number ?? null,
    seriesId: p?.series?.id || null,
    seriesTitle: p?.series?.title || null,
  }
}

const INTROSPECTION_QUERY = `query JoynSchemaProbe {
  epgEntry: __type(name: "EpgEntry") {
    name
    fields {
      name
      type { kind name ofType { kind name ofType { kind name } } }
    }
  }
  queryType: __type(name: "Query") {
    fields {
      name
      args { name type { kind name ofType { kind name } } }
      type { kind name ofType { kind name } }
    }
  }
}`

async function main() {
  const generatedAt = new Date().toISOString()
  const token = await anonymousToken()
  const discovered = await discoverApiKey()
  const apiKey = process.env.JOYN_GRAPHQL_API_KEY || discovered || OBSERVED_PUBLIC_WEBCLIENT_KEY

  const epg = await gql({ token, apiKey, operationName: 'LiveChannelsAndEPG', query: FULL_EPG_QUERY })
  if (!epg.ok || epg.body?.errors?.length || !epg.body?.data) {
    throw new Error('Joyn EPG probe failed: ' + JSON.stringify({ status: epg.status, errors: epg.body?.errors || epg.text }))
  }

  const schema = await gql({
    token,
    apiKey,
    operationName: 'JoynSchemaProbe',
    query: INTROSPECTION_QUERY,
  })

  const epgEventsV2Probe = await gql({
    token,
    apiKey,
    operationName: 'EpgEventsV2Probe',
    query: 'query EpgEventsV2Probe { epgEventsV2(from: 1790496180, to: 1790499600) { __typename } }',
  })

  const epgEventsV2ShapeProbe = await gql({
    token,
    apiKey,
    operationName: 'EpgEventsV2ShapeProbe',
    query: 'query EpgEventsV2ShapeProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { __typename } pageInfo { __typename } } }',
  })

  const streams = epg.body.data.liveStreams || []
  const report = {
    schemaVersion: 1,
    kind: 'joyn-detail-probe',
    generatedAt,
    apiKeySource: process.env.JOYN_GRAPHQL_API_KEY ? 'environment' : discovered ? 'public-webclient' : 'observed-fallback',
    schemaProbe: {
      ok: schema.ok && !schema.body?.errors?.length,
      httpStatus: schema.status,
      errors: schema.body?.errors || [],
      epgEntry: schema.body?.data?.epgEntry || null,
      queryType: schema.body?.data?.queryType || null,
      epgEventsV2Probe: {
        ok: epgEventsV2Probe.ok && !epgEventsV2Probe.body?.errors?.length,
        httpStatus: epgEventsV2Probe.status,
        errors: epgEventsV2Probe.body?.errors || [],
        data: epgEventsV2Probe.body?.data || null,
      },
      epgEventsV2ShapeProbe: {
        ok: epgEventsV2ShapeProbe.ok && !epgEventsV2ShapeProbe.body?.errors?.length,
        httpStatus: epgEventsV2ShapeProbe.status,
        errors: epgEventsV2ShapeProbe.body?.errors || [],
        data: epgEventsV2ShapeProbe.body?.data || null,
      },
    },
    targets: [],
  }

  for (const target of TARGETS) {
    const wanted = normalize(target)
    const epgMatches = []
    for (const stream of streams) {
      for (const event of stream?.epgEvents || []) {
        if (normalize(event?.program?.title) === wanted) epgMatches.push(compactProgram(stream, event))
      }
    }

    const search = await gql({
      token,
      apiKey,
      operationName: 'JoynDetailProbe',
      query: RICH_SEARCH_QUERY,
      variables: { term: target },
    })
    const searchResults = Array.isArray(search.body?.data?.search?.results) ? search.body.data.search.results : []

    const resolverProbes = epgMatches[0]?.programId
      ? await Promise.all(['epgEntry', 'epgEvent', 'program', 'asset', 'node'].map((name) => probeResolver({
        token,
        apiKey,
        name,
        programId: epgMatches[0].programId,
      })))
      : []

    report.targets.push({
      requestedTitle: target,
      epgMatches,
      resolverProbes,
      richSearch: {
        ok: search.ok && !search.body?.errors?.length,
        httpStatus: search.status,
        errors: search.body?.errors || [],
        resultCount: searchResults.length,
        results: searchResults.slice(0, 20),
      },
    })
  }

  const out = resolve(root, 'artifacts/joyn-detail-probe/report.json')
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

main().catch((error) => {
  process.stderr.write((error?.stack || String(error)) + '\n')
  process.exitCode = 1
})
