import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const webBuild = (process.env.GITHUB_SHA || 'local').slice(0, 7)
const webBuiltAt = new Date().toISOString()

export function stableVendorChunk(id) {
  const normalized = String(id || '').replaceAll('\\\\', '/')
  if (!normalized.includes('/node_modules/')) return undefined

  if (normalized.includes('/node_modules/react/')
      || normalized.includes('/node_modules/react-dom/')
      || normalized.includes('/node_modules/scheduler/')) {
    return 'vendor-react'
  }

  if (normalized.includes('/node_modules/firebase/')
      || normalized.includes('/node_modules/@firebase/')) {
    return 'vendor-firebase'
  }

  if (normalized.includes('/node_modules/@tanstack/')) {
    return 'vendor-tanstack'
  }

  return undefined
}

export default defineConfig({
  plugins: [react()],
  define: {
    __MOVIE_HUB_WEB_BUILD__: JSON.stringify(webBuild),
    __MOVIE_HUB_WEB_BUILT_AT__: JSON.stringify(webBuiltAt),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: stableVendorChunk,
      },
    },
  },
})
