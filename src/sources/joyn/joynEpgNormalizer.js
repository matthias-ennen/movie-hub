function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function iso(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function candidateKey(value) {
  return [
    value.joynChannelId || '',
    value.joynProgramId || '',
    value.startTime || '',
    value.endTime || '',
  ].join('|')
}

export function normalizeJoynLiveChannelsAndEpg(data) {
  const streams = Array.isArray(data?.liveStreams) ? data.liveStreams : []
  const candidates = []

  for (const stream of streams) {
    const joynChannelId = text(stream?.id)
    const channelTitle = text(stream?.title)
    if (!joynChannelId || !channelTitle) continue

    for (const event of Array.isArray(stream?.epgEvents) ? stream.epgEvents : []) {
      const program = event?.program || {}
      const joynProgramId = text(program?.id)
      const title = text(program?.title)
      const startTime = iso(program?.startDate || event?.startDate)
      const endTime = iso(program?.endDate || event?.endDate)

      if (!joynProgramId || !title || !startTime || !endTime) continue
      if (Date.parse(endTime) <= Date.parse(startTime)) continue

      candidates.push({
        source: 'joyn-epg',
        joynChannelId,
        channelTitle,
        brandId: text(stream?.brand?.brand_id),
        channelLogoUrl: text(stream?.logo?.url),
        streamType: text(stream?.type),
        quality: text(stream?.quality),
        joynProgramId,
        title,
        startTime,
        endTime,
        programType: text(program?.__typename),
      })
    }
  }

  const unique = new Map()
  for (const candidate of candidates) {
    unique.set(candidateKey(candidate), candidate)
  }

  return [...unique.values()].sort((left, right) => (
    left.startTime.localeCompare(right.startTime)
    || left.channelTitle.localeCompare(right.channelTitle)
    || left.joynProgramId.localeCompare(right.joynProgramId)
  ))
}
