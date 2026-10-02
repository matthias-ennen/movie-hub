import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowsDir = new URL('../.github/workflows/', import.meta.url)
const files = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()

describe('GitHub Actions runtime versions', () => {
  it('uses current Node-24-compatible action majors', () => {
    const obsolete = []
    for (const file of files) {
      const source = readFileSync(join(workflowsDir.pathname, file), 'utf8')
      const rules = [
        /actions\/checkout@v[1-6]\b/g,
        /actions\/setup-node@v[1-6]\b/g,
        /actions\/setup-java@v[1-5]\b/g,
        /actions\/upload-artifact@v[1-6]\b/g,
        /gradle\/actions\/setup-gradle@v[1-5]\b/g,
      ]
      for (const rule of rules) {
        for (const match of source.matchAll(rule)) obsolete.push(`${file}: ${match[0]}`)
      }
    }
    expect(obsolete).toEqual([])
  })
})
