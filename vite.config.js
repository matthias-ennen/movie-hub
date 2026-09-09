import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const webBuild = (process.env.GITHUB_SHA || 'local').slice(0, 7)
const webBuiltAt = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  define: {
    __MOVIE_HUB_WEB_BUILD__: JSON.stringify(webBuild),
    __MOVIE_HUB_WEB_BUILT_AT__: JSON.stringify(webBuiltAt),
  },
})
