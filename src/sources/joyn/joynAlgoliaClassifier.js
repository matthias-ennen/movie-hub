import { normalizeWaipuText } from '../../../scripts/waipu-program-classifier.mjs'

function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function titleVariants(hit) {
  return [
    hit?.titles?.DE,
    hit?.titles?.OV,
    hit?.title,
    hit?.name,
  ].map(text).filter(Boolean)
}

function topLevelVariants(hit) {
  return [
    hit?.topLevelTitles?.DE,
    hit?.topLevelTitles?.OV,
  ].map(text).filter(Boolean)
}

function normalized(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(normalizeWaipuText).filter(Boolean))]
}

function decoratedSeriesTitleMatches(inputTitle, candidateTitle) {
  const input = text(inputTitle)
  const candidate = text(candidateTitle)
  if (!input || !candidate) return false
  if (normalizeWaipuText(input) === normalizeWaipuText(candidate)) return true
  const left = input.toLocaleLowerCase('de-DE')
  const right = candidate.toLocaleLowerCase('de-DE')
  if (!right.startsWith(left)) return false
  const rest = right.slice(left.length).trimStart()
  return rest.startsWith('-')
    || rest.startsWith('–')
    || rest.startsWith('—')
    || rest.startsWith(':')
    || rest.startsWith('(')
}

function family(type) {
  if (type === 'MOVIE') return 'movie'
  if (type === 'SERIES' || type === 'EPISODE') return 'series'
  return null
}

function finite(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function classifyJoynAlgoliaHits(input, rawHits = []) {
  const wantedTitle = normalizeWaipuText(input?.title)
  const wantedEpisode = normalizeWaipuText(input?.secondaryTitle)
  if (!wantedTitle) return { type: null, reason: 'algolia_no_title', evidence: [] }

  const evidence = []
  for (const hit of Array.isArray(rawHits) ? rawHits : []) {
    const hitType = String(hit?.type ?? hit?.contentType ?? '').toUpperCase()
    const mediaFamily = family(hitType)
    if (!mediaFamily) continue

    const directTitles = titleVariants(hit)
    const topTitles = topLevelVariants(hit)
    const directNormalized = normalized(directTitles)
    const topNormalized = normalized(topTitles)

    let matchKind = null
    if (hitType === 'MOVIE') {
      if (directNormalized.includes(wantedTitle)) matchKind = 'movie_exact_title'
    } else if (hitType === 'SERIES') {
      if (directNormalized.includes(wantedTitle)) matchKind = 'series_exact_title'
      else if (directTitles.some((candidate) => decoratedSeriesTitleMatches(input?.title, candidate))) {
        matchKind = 'series_decorated_title'
      }
    } else if (hitType === 'EPISODE') {
      const topMatch = topNormalized.includes(wantedTitle)
        || topTitles.some((candidate) => decoratedSeriesTitleMatches(input?.title, candidate))
      const episodeMatch = wantedEpisode && directNormalized.includes(wantedEpisode)
      if (topMatch && episodeMatch) matchKind = 'episode_series_and_title'
      else if (topMatch) matchKind = 'episode_series_title'
    }

    if (!matchKind) continue
    evidence.push({
      type: mediaFamily,
      joynType: hitType,
      matchKind,
      id: text(hit?.id ?? hit?.objectID),
      title: directTitles[0] || null,
      titleDe: text(hit?.titles?.DE),
      titleOv: text(hit?.titles?.OV),
      topLevelTitle: topTitles[0] || null,
      topLevelTitleDe: text(hit?.topLevelTitles?.DE),
      topLevelTitleOv: text(hit?.topLevelTitles?.OV),
      productionYear: finite(hit?.productionYear ?? hit?.year),
      runtimeSeconds: finite(hit?.video?.duration ?? hit?.duration),
      seasonNumber: finite(hit?.season?.number),
      episodeNumber: finite(hit?.number ?? hit?.episode?.number),
      seriesId: text(hit?.series?.id),
      path: text(hit?.path),
      fullPath: text(hit?.fullPath),
      seriesPath: text(hit?.series?.path),
      topLevelPath: text(hit?.topLevelPath ?? hit?.topLevelPaths?.DE ?? hit?.topLevelPaths?.OV),
    })
  }

  const families = [...new Set(evidence.map((item) => item.type))]
  if (families.length !== 1) {
    return {
      type: null,
      reason: families.length > 1 ? 'algolia_conflicting_types' : 'algolia_no_validated_hit',
      evidence,
    }
  }

  const type = families[0]
  const sameFamily = evidence.filter((item) => item.type === type)
  const hardIdentity = sameFamily.filter((item) => (
    item.matchKind === 'movie_exact_title'
    || item.matchKind === 'series_exact_title'
    || item.matchKind === 'episode_series_and_title'
  ))
  const uniqueHard = hardIdentity.length === 1 ? hardIdentity[0] : null
  const productionYear = uniqueHard
    && (uniqueHard.matchKind === 'movie_exact_title' || uniqueHard.matchKind === 'series_exact_title')
    ? uniqueHard.productionYear
    : null
  const episodeProductionYear = uniqueHard?.matchKind === 'episode_series_and_title'
    ? uniqueHard.productionYear
    : null

  return {
    type,
    reason: 'validated_algolia_search',
    evidence: sameFamily,
    productionYear: productionYear ?? null,
    episodeProductionYear: episodeProductionYear ?? null,
    runtimeSeconds: uniqueHard?.runtimeSeconds ?? null,
    seasonNumber: uniqueHard?.seasonNumber ?? null,
    episodeNumber: uniqueHard?.episodeNumber ?? null,
    seriesId: uniqueHard?.seriesId ?? null,
  }
}
