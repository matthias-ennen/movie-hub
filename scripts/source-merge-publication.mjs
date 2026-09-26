import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mergeSourceGenerations } from '../src/sources/sourceMerge.js'

export async function writeMergedSourcePublication(outputPath, input, options = {}) {
  const publication = mergeSourceGenerations(input, options)
  const target = resolve(outputPath)
  const staging = `${target}.staging.${process.pid}.${randomUUID()}`
  const backup = `${target}.backup.${process.pid}.${randomUUID()}`
  await mkdir(dirname(target), { recursive: true })
  let hasBackup = false
  try {
    await writeFile(staging, `${JSON.stringify(publication, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    try {
      await rename(target, backup)
      hasBackup = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    try {
      await rename(staging, target)
    } catch (error) {
      if (hasBackup) await rename(backup, target)
      throw error
    }
    if (hasBackup) await rm(backup, { force: true })
    return publication
  } finally {
    await rm(staging, { force: true })
  }
}
