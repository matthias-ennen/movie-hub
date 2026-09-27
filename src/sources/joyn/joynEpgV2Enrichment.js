function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function normalizeV2Program(program) {
  if (!program || program.__typename !== 'EpgEntryV2') return null
  const id = text(program.id)
  if (!id) return null
  return {
    joynProgramId: id,
    title: text(program.title),
    secondaryTitle: text(program.secondaryTitle),
    description: text(program.description),
    programImageUrl: text((Array.isArray(program.images) ? program.images : [])
      .find((image) => image?.url)?.url),
    ageRating: program?.ageRating?.minAge !== null
      && program?.ageRating?.minAge !== undefined
      && String(program.ageRating.minAge).trim() !== ''
      && Number.isFinite(Number(program.ageRating.minAge))
      ? Number(program.ageRating.minAge)
      : null,
  }
}

export function normalizeJoynEpgV2(data) {
  const items = Array.isArray(data?.epgEventsV2?.items) ? data.epgEventsV2.items : []
  const byProgramId = new Map()
  for (const item of items) {
    const program = normalizeV2Program(item?.program)
    if (!program) continue
    const channelId = text(item?.livestream?.id)
    const current = byProgramId.get(program.joynProgramId)
    const next = {
      ...program,
      joynChannelId: channelId,
    }
    if (!current
        || (!current.description && next.description)
        || (!current.programImageUrl && next.programImageUrl)) {
      byProgramId.set(program.joynProgramId, next)
    }
  }
  return byProgramId
}

export function enrichJoynCandidatesWithV2(candidates, data) {
  const v2ByProgramId = normalizeJoynEpgV2(data)
  let enriched = 0
  let descriptions = 0
  let images = 0
  const entries = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const v2 = v2ByProgramId.get(candidate?.joynProgramId)
    if (!v2) return candidate
    if (v2.joynChannelId && candidate?.joynChannelId && v2.joynChannelId !== candidate.joynChannelId) {
      return candidate
    }
    enriched += 1
    if (v2.description) descriptions += 1
    if (v2.programImageUrl) images += 1
    return {
      ...candidate,
      secondaryTitle: candidate.secondaryTitle || v2.secondaryTitle,
      description: candidate.description || v2.description,
      programImageUrl: candidate.programImageUrl || v2.programImageUrl,
      ageRating: candidate.ageRating ?? v2.ageRating,
      epgV2Enriched: true,
    }
  })
  return {
    entries,
    metrics: {
      v2Programs: v2ByProgramId.size,
      enriched,
      descriptions,
      images,
    },
  }
}
