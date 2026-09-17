import fs from 'node:fs'

const path = 'dist/hero-player.html'
const marker = 'Movie Hub Hero Trailer'

if (!fs.existsSync(path)) {
  throw new Error(`${path} fehlt nach dem Build. Firebase würde /hero-player.html sonst über die SPA-Rewrite auf /index.html umleiten.`)
}

const html = fs.readFileSync(path, 'utf8')
if (!html.includes(marker)) {
  throw new Error(`${path} existiert, enthält aber nicht den erwarteten Marker "${marker}".`)
}

if (html.includes('<div id="root"></div>')) {
  throw new Error(`${path} sieht wie die Haupt-App index.html aus. Abbruch, um eine rekursive Hero-IFrame-Ladung zu verhindern.`)
}

console.log(`Hero-Player-Build geprüft: ${path} (${Buffer.byteLength(html)} Bytes) enthält den erwarteten Marker.`)
