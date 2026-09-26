import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

export function buildFieldDiscoveryMarkdown(report) {
  const summary = report?.summary || { breaking: 0, review: 0, info: 0 }
  const lines = [
    `# Source schema report – ${report?.sourceId || 'unknown-source'}`,
    '',
    `Generated: ${report?.generatedAt || 'unknown'}`,
    '',
    `- BREAKING: ${summary.breaking || 0}`,
    `- REVIEW: ${summary.review || 0}`,
    `- INFO: ${summary.info || 0}`,
    '',
  ]

  for (const severity of ['BREAKING', 'REVIEW', 'INFO']) {
    const entries = safeArray(report?.fields).filter((field) => field.severity === severity)
    if (!entries.length) continue
    lines.push(`## ${severity}`, '')
    for (const field of entries) {
      const extras = [
        field.status ? `status=${field.status}` : null,
        field.decision ? `decision=${field.decision}` : null,
        field.types?.length ? `types=${field.types.join(',')}` : null,
        field.capability ? `capability=${field.capability}` : null,
        field.extensionNamespace ? `extension=${field.extensionNamespace}` : null,
      ].filter(Boolean).join(' · ')
      lines.push(`- \`${field.path}\`${extras ? ` — ${extras}` : ''}`)
      if (field.reason) lines.push(`  - ${field.reason}`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

export async function writeFieldDiscoveryReport(report, { jsonPath, markdownPath } = {}) {
  if (!jsonPath || !markdownPath) throw new TypeError('jsonPath and markdownPath are required.')
  await Promise.all([
    mkdir(dirname(jsonPath), { recursive: true }),
    mkdir(dirname(markdownPath), { recursive: true }),
  ])
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(markdownPath, buildFieldDiscoveryMarkdown(report), 'utf8'),
  ])
  return { jsonPath, markdownPath }
}