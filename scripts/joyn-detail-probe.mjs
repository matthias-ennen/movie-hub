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

async function gqlPersisted({ token, apiKey, operationName, hash, variables = {} }) {
  const params = new URLSearchParams()
  params.set('operationName', operationName)
  params.set('enable_user_location', 'true')
  params.set('watch_assistant_variant', 'true')
  params.set('variables', JSON.stringify(variables))
  params.set('extensions', JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: hash },
  }))
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
  const rawText = await response.text()
  let body = null
  try { body = JSON.parse(rawText) } catch {}
  return { ok: response.ok, status: response.status, body, text: rawText.slice(0, 2000) }
}

function findTitleObjects(value, wanted, path = 'root', out = []) {
  if (!value || typeof value !== 'object' || out.length >= 20) return out
  if (!Array.isArray(value) && normalize(value.title) === wanted) out.push({ path, value })
  if (Array.isArray(value)) {
    value.forEach((item, index) => findTitleObjects(item, wanted, path + '[' + index + ']', out))
  } else {
    for (const [key, child] of Object.entries(value)) {
      findTitleObjects(child, wanted, path + '.' + key, out)
    }
  }
  return out
}

function keyShape(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return typeof value
  if (Array.isArray(value)) {
    return { kind: 'array', length: value.length, first: value.length ? keyShape(value[0], depth + 1) : null }
  }
  if (typeof value !== 'object') return typeof value
  return Object.fromEntries(
    Object.entries(value).slice(0, 40).map(([key, child]) => [key, keyShape(child, depth + 1)]),
  )
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

  const epgEventV2FieldProbe = await gql({
    token,
    apiKey,
    operationName: 'EpgEventV2FieldProbe',
    query: 'query EpgEventV2FieldProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { id title secondaryTitle startDate endDate description productionYear duration genres ageRating images livestream program asset movie series episode channelId } } }',
  })

  const epgProgramV2FieldProbe = await gql({
    token,
    apiKey,
    operationName: 'EpgProgramV2FieldProbe',
    query: 'query EpgProgramV2FieldProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { livestream { id title brandId brandCode brand { id title } } program { id title secondaryTitle description productionYear duration genres ageRating images type contentType movieId seriesId episodeId path startDate endDate } } } }',
  })

  const epgProgramV2CandidateProbe = await gql({
    token,
    apiKey,
    operationName: 'EpgProgramV2CandidateProbe',
    query: 'query EpgProgramV2CandidateProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { program { metadata content event details asset name headline subtitle label year releaseYear productionDate programId contentId externalId gracenoteId tmsId image imageUrl poster season episode categories classification flags schedule timeslot } } } }',
  })

  const persistedLive = await gqlPersisted({
    token,
    apiKey,
    operationName: 'LiveChannelsAndEpg',
    hash: 'b7703103ddd0516be6b49ed66186092a6c6f6d815ccc502a9f50800a8cc18dd2',
    variables: {
      liveStreamGroupFilter: 'DEFAULT',
      first: 5000,
      offset: 0,
      livestreamTypes: ['EVENT', 'LINEAR', 'ON_DEMAND'],
      from: 1790496180,
      to: 1790499600,
    },
  })
  const persistedTargetMatches = findTitleObjects(
    persistedLive.body?.data || null,
    normalize('Das singende, klingende Bäumchen'),
  )

  const streams = epg.body.data.liveStreams || []
  const report = {
    schemaVersion: 1,
    kind: 'joyn-detail-probe',
    generatedAt,
    apiKeySource: process.env.JOYN_GRAPHQL_API_KEY ? 'environment' : discovered ? 'public-webclient' : 'observed-fallback',
    persistedLiveChannelsAndEpg: {
      ok: persistedLive.ok && !persistedLive.body?.errors?.length,
      httpStatus: persistedLive.status,
      errors: persistedLive.body?.errors || [],
      shape: keyShape(persistedLive.body?.data || null),
      targetMatches: persistedTargetMatches,
    },
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
      epgEventV2FieldProbe: {
        ok: epgEventV2FieldProbe.ok && !epgEventV2FieldProbe.body?.errors?.length,
        httpStatus: epgEventV2FieldProbe.status,
        errors: epgEventV2FieldProbe.body?.errors || [],
        data: epgEventV2FieldProbe.body?.data || null,
      },
      epgProgramV2FieldProbe: {
        ok: epgProgramV2FieldProbe.ok && !epgProgramV2FieldProbe.body?.errors?.length,
        httpStatus: epgProgramV2FieldProbe.status,
        errors: epgProgramV2FieldProbe.body?.errors || [],
        data: epgProgramV2FieldProbe.body?.data || null,
      },
      epgProgramV2CandidateProbe: {
        ok: epgProgramV2CandidateProbe.ok && !epgProgramV2CandidateProbe.body?.errors?.length,
        httpStatus: epgProgramV2CandidateProbe.status,
        errors: epgProgramV2CandidateProbe.body?.errors || [],
        data: epgProgramV2CandidateProbe.body?.data || null,
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

    const epgEventsV2ShapeProbe = await gql({
      token,
      apiKey,
      operationName: 'EpgEventsV2ShapeProbe',
      query: 'query EpgEventsV2ShapeProbe { epgEventsV2 { __typename } }',
    })
    const epgEventsV2ArgumentProbes = await Promise.all([
      ['number', 'query EpgEventsV2NumberProbe { epgEventsV2(from: 1790496180, to: 1790499600) { __typename } }'],
      ['string', 'query EpgEventsV2StringProbe { epgEventsV2(from: "1790496180", to: "1790499600") { __typename } }'],
      ['object', 'query EpgEventsV2ObjectProbe { epgEventsV2(from: {}, to: {}) { __typename } }'],
    ].map(async ([kind, query]) => {
      const result = await gql({
        token,
        apiKey,
        operationName: 'EpgEventsV2ArgumentProbe',
        query,
      })
      return {
        kind,
        ok: result.ok && !result.body?.errors?.length,
        httpStatus: result.status,
        errors: result.body?.errors || [],
        data: result.body?.data || null,
      }
    }))

    const epgEventsV2ConnectionProbes = await Promise.all([
      ['unknown', 'query EpgEventsV2ConnectionUnknown { epgEventsV2(from: 1790496180, to: 1790499600) { totallyUnknownField } }'],
      ['nodes', 'query EpgEventsV2ConnectionNodes { epgEventsV2(from: 1790496180, to: 1790499600) { nodes { __typename } } }'],
      ['edges', 'query EpgEventsV2ConnectionEdges { epgEventsV2(from: 1790496180, to: 1790499600) { edges { __typename } } }'],
      ['items', 'query EpgEventsV2ConnectionItems { epgEventsV2(from: 1790496180, to: 1790499600) { items { __typename } } }'],
      ['events', 'query EpgEventsV2ConnectionEvents { epgEventsV2(from: 1790496180, to: 1790499600) { events { __typename } } }'],
      ['totalCount', 'query EpgEventsV2ConnectionCount { epgEventsV2(from: 1790496180, to: 1790499600) { totalCount } }'],
      ['pageInfo', 'query EpgEventsV2ConnectionPage { epgEventsV2(from: 1790496180, to: 1790499600) { pageInfo { __typename } } }'],
    ].map(async ([kind, query]) => {
      const result = await gql({
        token,
        apiKey,
        operationName: 'EpgEventsV2ConnectionProbe',
        query,
      })
      return {
        kind,
        ok: result.ok && !result.body?.errors?.length,
        httpStatus: result.status,
        errors: result.body?.errors || [],
        data: result.body?.data || null,
      }
    }))


    const epgEventsV2EventFieldProbes = await Promise.all([
      ['id', 'items { id }'],
      ['title', 'items { title }'],
      ['secondaryTitle', 'items { secondaryTitle }'],
      ['startDate', 'items { startDate }'],
      ['endDate', 'items { endDate }'],
      ['description', 'items { description }'],
      ['productionYear', 'items { productionYear }'],
      ['genres', 'items { genres { name } }'],
      ['livestream', 'items { livestream { id gracenoteId brand { id title } } }'],
      ['asset', 'items { asset { __typename } }'],
      ['program', 'items { program { __typename } }'],
      ['content', 'items { content { __typename } }'],
      ['movie', 'items { movie { __typename } }'],
      ['series', 'items { series { __typename } }'],
      ['episode', 'items { episode { __typename } }'],
      ['images', 'items { images { id type url } }'],
      ['unknown', 'items { totallyUnknownField }'],
    ].map(async ([kind, selection]) => {
      const query = `query EpgEventsV2EventFieldProbe { epgEventsV2(from: 1790496180, to: 1790499600) { ${selection} } }`
      const result = await gql({
        token,
        apiKey,
        operationName: 'EpgEventsV2EventFieldProbe',
        query,
      })
      return {
        kind,
        ok: result.ok && !result.body?.errors?.length,
        httpStatus: result.status,
        errors: result.body?.errors || [],
        data: result.body?.data || null,
      }
    }))


    const epgEntryV2FieldProbes = await Promise.all([
      ['id', 'program { id }'],
      ['title', 'program { title }'],
      ['secondaryTitle', 'program { secondaryTitle }'],
      ['startDate', 'program { startDate }'],
      ['endDate', 'program { endDate }'],
      ['description', 'program { description }'],
      ['productionYear', 'program { productionYear }'],
      ['genres', 'program { genres { name } }'],
      ['images', 'program { images { id type url } }'],
      ['ageRating', 'program { ageRating { minAge description ratingSystem } }'],
      ['duration', 'program { duration }'],
      ['asset', 'program { asset { __typename } }'],
      ['content', 'program { content { __typename } }'],
      ['movie', 'program { movie { __typename } }'],
      ['series', 'program { series { __typename } }'],
      ['episode', 'program { episode { __typename } }'],
      ['externalId', 'program { externalId }'],
      ['gracenoteId', 'program { gracenoteId }'],
      ['type', 'program { type }'],
      ['unknown', 'program { totallyUnknownField }'],
    ].map(async ([kind, selection]) => {
      const query = `query EpgEntryV2FieldProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { ${selection} } } }`
      const result = await gql({
        token,
        apiKey,
        operationName: 'EpgEntryV2FieldProbe',
        query,
      })
      return {
        kind,
        ok: result.ok && !result.body?.errors?.length,
        httpStatus: result.status,
        errors: result.body?.errors || [],
        data: result.body?.data || null,
      }
    }))


    const epgEntryV2FragmentFieldProbes = await Promise.all([
      ['id', 'id'],
      ['title', 'title'],
      ['secondaryTitle', 'secondaryTitle'],
      ['startDate', 'startDate'],
      ['endDate', 'endDate'],
      ['description', 'description'],
      ['productionYear', 'productionYear'],
      ['genres', 'genres { name }'],
      ['images', 'images { id type url }'],
      ['ageRating', 'ageRating { minAge description ratingSystem }'],
      ['duration', 'duration'],
      ['asset', 'asset { __typename }'],
      ['content', 'content { __typename }'],
      ['movie', 'movie { __typename }'],
      ['series', 'series { __typename }'],
      ['episode', 'episode { __typename }'],
      ['externalId', 'externalId'],
      ['gracenoteId', 'gracenoteId'],
      ['type', 'type'],
      ['unknown', 'totallyUnknownField'],
    ].map(async ([kind, field]) => {
      const query = `query EpgEntryV2FragmentFieldProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { program { __typename ... on EpgEntryV2 { ${field} } } } } }`
      const result = await gql({
        token,
        apiKey,
        operationName: 'EpgEntryV2FragmentFieldProbe',
        query,
      })
      return {
        kind,
        ok: result.ok && !result.body?.errors?.length,
        httpStatus: result.status,
        errors: result.body?.errors || [],
        data: result.body?.data || null,
      }
    }))


    const epgEntryV2IdentityProbes = await Promise.all([
      ['genreNames', 'genres { names }'],
      ['year', 'year'],
      ['releaseYear', 'releaseYear'],
      ['originalTitle', 'originalTitle'],
      ['programType', 'programType'],
      ['contentType', 'contentType'],
      ['category', 'category'],
      ['categories', 'categories'],
      ['seasonNumber', 'seasonNumber'],
      ['episodeNumber', 'episodeNumber'],
      ['episodeTitle', 'episodeTitle'],
      ['seriesTitle', 'seriesTitle'],
      ['countries', 'countries'],
      ['productionCountries', 'productionCountries'],
      ['shortDescription', 'shortDescription'],
      ['longDescription', 'longDescription'],
      ['subtitle', 'subtitle'],
    ].map(async ([kind, field]) => {
      const query = `query EpgEntryV2IdentityProbe { epgEventsV2(from: 1790496180, to: 1790499600) { items { program { __typename ... on EpgEntryV2 { ${field} } } } } }`
      const result = await gql({
        token,
        apiKey,
        operationName: 'EpgEntryV2IdentityProbe',
        query,
      })
      return {
        kind,
        ok: result.ok && !result.body?.errors?.length,
        httpStatus: result.status,
        errors: result.body?.errors || [],
        data: result.body?.data || null,
      }
    }))

    report.targets.push({
      requestedTitle: target,
      epgMatches,
      resolverProbes,
      epgEventsV2ShapeProbe: {
        ok: epgEventsV2ShapeProbe.ok && !epgEventsV2ShapeProbe.body?.errors?.length,
        httpStatus: epgEventsV2ShapeProbe.status,
        errors: epgEventsV2ShapeProbe.body?.errors || [],
        data: epgEventsV2ShapeProbe.body?.data || null,
      },
      epgEventsV2ArgumentProbes,
      epgEventsV2ConnectionProbes,
      epgEventsV2EventFieldProbes,
      epgEntryV2FieldProbes,
      epgEntryV2FragmentFieldProbes,
      epgEntryV2IdentityProbes,
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
