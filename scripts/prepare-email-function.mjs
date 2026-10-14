import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sources = ['server/email', 'src/notifications/profileEmailModel.js',
  'src/notifications/titleAlertModel.js', 'src/notifications/titleAlertLifecycleModel.js']
for (const source of sources) {
  const target = resolve(root, 'email-functions', source)
  await mkdir(dirname(target), { recursive: true })
  await cp(resolve(root, source), target, { recursive: true })
}
console.log('Prepared isolated profile-email source. No deployment or email sent.')
