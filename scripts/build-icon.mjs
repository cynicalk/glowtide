// Renders Glowtide's icon from the SVG below into build/icon.png, build/icon.ico (16–256 px)
// and resources/icon.png (window and tray). Run with: npx electron scripts/build-icon.mjs
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// A dark tile with a glowing album-colour edge (the edge glow) around a single star
// (the constellation lyrics).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
  <radialGradient id="bg" cx="50%" cy="38%" r="75%">
    <stop offset="0" stop-color="#1c1626"/><stop offset="1" stop-color="#07060a"/>
  </radialGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff5fa2"/><stop offset="0.5" stop-color="#9b6bff"/><stop offset="1" stop-color="#4cc9ff"/>
  </linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<rect x="8" y="8" width="496" height="496" rx="112" fill="url(#bg)"/>
<rect x="58" y="58" width="396" height="396" rx="76" fill="none" stroke="url(#edge)" stroke-width="22" filter="url(#glow)" opacity="0.9"/>
<rect x="58" y="58" width="396" height="396" rx="76" fill="none" stroke="url(#edge)" stroke-width="12"/>
<g transform="translate(256 256)">
  <path d="M0,-118 C12,-12 12,-12 118,0 C12,12 12,12 0,118 C-12,12 -12,12 -118,0 C-12,-12 -12,-12 0,-118 Z" fill="#c9b8ff" filter="url(#soft)" opacity="0.85"/>
  <path d="M0,-108 C11,-11 11,-11 108,0 C11,11 11,11 0,108 C-11,11 -11,11 -108,0 C-11,-11 -11,-11 0,-108 Z" fill="#ffffff"/>
</g>
</svg>`

function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(pngs.length, 4)
  let offset = head.length
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    head.writeUInt8(size >= 256 ? 0 : size, e)
    head.writeUInt8(size >= 256 ? 0 : size, e + 1)
    head.writeUInt16LE(1, e + 4) // planes
    head.writeUInt16LE(32, e + 6) // bits per pixel
    head.writeUInt32LE(data.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...pngs.map((p) => p.data)])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${SVG}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 400))
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const big = full.resize({ width: 512, height: 512, quality: 'best' })
  const at = (n) => big.resize({ width: n, height: n, quality: 'best' }).toPNG()
  writeFileSync(join(root, 'build/icon.png'), big.toPNG())
  writeFileSync(join(root, 'resources/icon.png'), at(256))
  writeFileSync(
    join(root, 'build/icon.ico'),
    ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: at(size) })))
  )
  console.log('icon written')
  app.quit()
})
