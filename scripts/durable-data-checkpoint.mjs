import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const exec = promisify(execFile)
const files = {
  waipu: [
    'artifacts/waipu-sync',
    'artifacts/waipu-live/match-decisions.json',
    'artifacts/waipu-live/detail-status.json',
    'artifacts/waipu-live/unresolved.json',
  ],
  tmdb: ['artifacts/tmdb-data/state.json', 'artifacts/tmdb-data/last-run.json'],
}
const required = {
  waipu: 'artifacts/waipu-sync/checkpoint.json',
  tmdb: 'artifacts/tmdb-data/state.json',
}
const prefix = 'data-checkpoints/v1'

function paths(group) {
  if (!Object.hasOwn(files, group)) throw new Error('Unknown checkpoint group.')
  return files[group]
}

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function optionalPaths(root, group) {
  const present = []
  for (const path of paths(group)) {
    try {
      await stat(resolve(root, path))
      present.push(path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  if (!present.includes(required[group]) && group === 'tmdb') throw new Error('Committed TMDB checkpoint missing.')
  if (group === 'waipu' && !await exists(resolve(root, required[group]))) throw new Error('Waipu checkpoint missing.')
  return present
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function allowedEntry(group, path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) return false
  const normalized = path.replace(/\/$/, '')
  return paths(group).some((entry) => normalized === entry || (
    entry === 'artifacts/waipu-sync' && normalized.startsWith(`${entry}/`)
  ))
}

async function checkRegularTree(root) {
  const inspect = async (path) => {
    const info = await lstat(path)
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new Error('Checkpoint contains a non-regular entry.')
    if (info.isDirectory()) for (const child of await readdir(path)) await inspect(join(path, child))
  }
  await inspect(root)
}

async function validateExtracted(root, group) {
  const value = JSON.parse(await readFile(resolve(root, required[group]), 'utf8'))
  if (group === 'waipu') {
    if (value?.kind !== 'waipu-sync-checkpoint' || value?.schemaVersion !== 1 || !value.slots || !value.circuit) {
      throw new Error('Invalid Waipu checkpoint.')
    }
    if (Object.keys(value.slots).length && !await exists(resolve(root, 'artifacts/waipu-sync/cache'))) {
      throw new Error('Waipu slots cannot be restored without their cache.')
    }
  } else if (value?.kind !== 'tmdb-change-state' || value?.version !== 1 || !value.pending) {
    throw new Error('Invalid TMDB checkpoint.')
  }
  await checkRegularTree(resolve(root, 'artifacts'))
}

export async function makeArchive({ root, group }) {
  const present = await optionalPaths(root, group)
  const directory = await mkdtemp(join(tmpdir(), 'movie-hub-checkpoint-'))
  const archive = resolve(directory, 'checkpoint.tar.gz')
  try {
    await exec('tar', ['--exclude=artifacts/waipu-sync/active.lock', '-czf', archive, '-C', root, ...present])
    return { directory, archive, sha256: await hashFile(archive), size: (await stat(archive)).size }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function inspectArchive({ archive, sha256, group }) {
  paths(group)
  if (await hashFile(archive) !== sha256) throw new Error('Checkpoint checksum mismatch.')
  const { stdout } = await exec('tar', ['-tzf', archive], { maxBuffer: 30 * 1024 * 1024 })
  for (const entry of stdout.split('\n').filter(Boolean)) {
    if (!allowedEntry(group, entry)) throw new Error(`Unexpected checkpoint path: ${entry}`)
  }
  const directory = await mkdtemp(join(tmpdir(), 'movie-hub-restore-'))
  try {
    await exec('tar', ['-xzf', archive, '-C', directory, '--no-same-owner'])
    await validateExtracted(directory, group)
    return directory
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function applyArchive({ root, archive, sha256, group }) {
  const staging = await inspectArchive({ archive, sha256, group })
  try {
    if (group === 'tmdb') await rm(resolve(root, 'artifacts/tmdb-data'), { recursive: true, force: true })
    for (const path of paths(group)) {
      const source = resolve(staging, path)
      const target = resolve(root, path)
      await rm(target, { recursive: true, force: true })
      if (await exists(source)) {
        await mkdir(dirname(target), { recursive: true })
        await cp(source, target, { recursive: true })
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

function pointerPath(group) {
  paths(group)
  return `${prefix}/${group}/latest.json`
}

async function readPointer(bucket, group) {
  try {
    const [bytes] = await bucket.file(pointerPath(group)).download()
    const pointer = JSON.parse(bytes.toString('utf8'))
    const objectName = String(pointer?.object || '')
    if (pointer?.group !== group || pointer?.version !== 1
      || !objectName.startsWith(`${prefix}/${group}/`)
      || !/^[a-f0-9-]+\.tar\.gz$/.test(objectName.slice(`${prefix}/${group}/`.length))
      || !/^[a-f0-9]{64}$/.test(pointer.sha256)
      || !Number.isSafeInteger(pointer.size) || pointer.size <= 0 || pointer.size > 2_000_000_000) {
      throw new Error('Invalid checkpoint pointer.')
    }
    return pointer
  } catch (error) {
    if (Number(error?.code) === 404) return null
    throw error
  }
}

export async function uploadCheckpoint({ root, group, bucket }) {
  const value = await makeArchive({ root, group })
  const object = `${prefix}/${group}/${randomUUID()}.tar.gz`
  try {
    const staged = await inspectArchive({ archive: value.archive, sha256: value.sha256, group })
    await rm(staged, { recursive: true, force: true })
    await bucket.upload(value.archive, {
      destination: object,
      validation: 'crc32c',
      preconditionOpts: { ifGenerationMatch: 0 },
    })
    const pointer = {
      version: 1, group, object, sha256: value.sha256,
      size: value.size, savedAt: new Date().toISOString(),
    }
    await bucket.file(pointerPath(group)).save(JSON.stringify(pointer), {
      resumable: false,
      contentType: 'application/json',
    })
    return pointer
  } finally {
    await rm(value.directory, { recursive: true, force: true })
  }
}

export async function downloadCheckpoint({ root, group, bucket, apply = true }) {
  const pointer = await readPointer(bucket, group)
  if (!pointer) return null
  const directory = await mkdtemp(join(tmpdir(), 'movie-hub-download-'))
  const archive = resolve(directory, 'checkpoint.tar.gz')
  try {
    await bucket.file(pointer.object).download({ destination: archive })
    if ((await stat(archive)).size !== pointer.size) throw new Error('Checkpoint size mismatch.')
    if (apply) await applyArchive({ root, archive, sha256: pointer.sha256, group })
    else {
      const staging = await inspectArchive({ archive, sha256: pointer.sha256, group })
      await rm(staging, { recursive: true, force: true })
    }
    return pointer
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function main() {
  const [mode, group] = process.argv.slice(2)
  paths(group)
  if (!['restore', 'upload', 'probe'].includes(mode)) throw new Error('Use restore, upload or probe.')
  const bucketName = process.env.DATA_CHECKPOINT_BUCKET
  if (!bucketName) throw new Error('DATA_CHECKPOINT_BUCKET is required.')
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'movie-hub-62459'
  const [{ applicationDefault, initializeApp, deleteApp }, { getStorage }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/storage'),
  ])
  const app = initializeApp({ credential: applicationDefault(), projectId }, 'durable-data-checkpoint')
  try {
    const bucket = getStorage(app).bucket(bucketName)
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const pointer = mode === 'upload'
      ? await uploadCheckpoint({ root, group, bucket })
      : await downloadCheckpoint({ root, group, bucket, apply: mode === 'restore' })
    console.log(`Checkpoint ${group} ${mode}: ${pointer ? `${pointer.savedAt}, ${pointer.size} bytes` : 'no remote snapshot; local cache retained'}`)
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
