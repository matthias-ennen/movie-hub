import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const baseUrl = process.env.MOVIE_HUB_LIVE_URL || 'https://movie-hub-62459.web.app'
const outputDirectory = resolve(process.env.WORKFLOW_BASELINE_DIRECTORY || 'artifacts/workflow-baseline')

const sources = Object.freeze([
  ['data-status.json', '/data-status.json'],
  ['waipu-index.json', '/waipu-live/index.json'],
])

export async function captureWorkflowBaseline({ fetchImpl = fetch } = {}) {
  await mkdir(outputDirectory, { recursive: true })
  const results = []
  for (const [filename, pathname] of sources) {
    try {
      const response = await fetchImpl(new URL(pathname, baseUrl), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = await response.json()
      await writeFile(resolve(outputDirectory, filename), `${JSON.stringify(value)}\n`, 'utf8')
      results.push({ filename, status: 'captured' })
    } catch (error) {
      results.push({ filename, status: 'unavailable', reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  captureWorkflowBaseline()
    .then((results) => console.log(`Workflow baseline: ${results.map(({ filename, status }) => `${filename}=${status}`).join(', ')}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
