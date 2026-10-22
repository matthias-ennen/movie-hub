/** Two user-controlled playlist URLs/IDs via manual workflow inputs only.
 * No YouTube search, TMDB matching, catalog import or badge mutations.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet } from './youtube-api-smoke.mjs'
import { runTwoCuratedPlaylistAudit } from './youtube-g2-curated-two-playlists.mjs'
export const OUTPUT = 'artifacts/youtube-g2/curated-playlists'

export function reportCuratedPlaylists(result) {
  const lines = [
    '# YouTube G2 – Your two fixed curated playlists (READ ONLY)',
    '',
    '- Mode: ' + result.mode,
    '- Playlist owner channel IDs (not verified offer owners): ' + result.playlistOwnerChannelIds.join(', '),
    '- Both playlists have same owner: ' + result.playlistsHaveSameOwner,
    '- Unique resolved playlist video IDs: ' + result.uniqueVideoIds,
    '- Playlist scanning complete: ' + result.fullyScanned,
    '- Cross-playlist category conflicts: ' + result.crossPlaylistConflicts,
    '- YouTube endpoints: ' + JSON.stringify(result.calls),
    '- Content review: ' + JSON.stringify(result.counts),
    '- **Not automatically a verified movie or German rent/buy/free offer.**',
    '- **Zero** MovieHub catalog, Firestore, provider badge, nightly and playback writes.',
    '',
    '| Source | Playlist ID | Publisher channel ID | Videos | Pages | Complete |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...result.playlistSummaries.map(s => '| ' + s.mode + ' | ' + s.playlistId
      + ' | ' + s.ownerChannelId + ' | ' + s.distinctVideoIds + ' | '
      + s.pages + ' | ' + s.fullyScanned + ' |'),
    '',
    '| YouTube video ID | Editorial class (unverified) | Status | Runtime | DE indication |',
    '| --- | --- | --- | ---: | --- |',
    ...result.candidates.map(c => '| ' + c.videoId + ' | ' + c.editorialOfferHint
      + ' | ' + c.status + ' | ' + (c.minutes ?? '?')
      + ' | ' + c.deRegionSignal + ' |'),
    '',
    'Next: match these **known IDs** to the canonical TMDB work,',
    'compare against real MovieHub index; review verified DE access and film identity.',
    'Do NOT import automatically and do NOT treat a playlist category as an offer.',
    '',
  ]
  return lines.join('\n')
}

async function main() {
  if (process.env.YOUTUBE_G2_WRITE_MODE) throw new Error('READ_ONLY_MODE_REQUIRED')
  const playlists = {
    free: process.env.YOUTUBE_G2_CURATED_FREE_PLAYLIST || '',
    rentBuy: process.env.YOUTUBE_G2_CURATED_RENT_BUY_PLAYLIST || '',
  }
  const key = getSecret()
  const result = await runTwoCuratedPlaylistAudit({
    playlists,
    youtubeApi: (endpoint, params) => youtubeGet(endpoint, params, key),
  })
  await mkdir(OUTPUT, { recursive: true })
  await writeFile(OUTPUT + '/qa.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  await writeFile(OUTPUT + '/report.md', reportCuratedPlaylists(result) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({
    success: true, uniqueVideoIds: result.uniqueVideoIds,
    complete: result.fullyScanned, conflicts: result.crossPlaylistConflicts,
    calls: result.calls, providerWrites: 0, catalogWrites: 0, firestoreWrites: 0,
  }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('YouTube two-playlist audit failed closed: ' + e.message); process.exitCode = 1 })
}
