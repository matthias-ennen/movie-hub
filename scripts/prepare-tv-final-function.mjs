import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sources = [
  'scripts/check-tv-final-reminders.mjs',
  'src/notifications/titleAlertLifecycleModel.js',
  'src/notifications/titleAlertModel.js',
  'src/notifications/tvFinalReminderModel.js',
]
for (const source of sources) {
  const target = resolve(root, 'functions', source)
  await mkdir(dirname(target), { recursive: true })
  await cp(resolve(root, source), target)
}
console.log(`Prepared ${sources.length} audited TV reminder modules for Firebase Functions deployment.`)
