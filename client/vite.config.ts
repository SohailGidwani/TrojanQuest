import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Only VITE_ values are exposed; the server key stays outside the browser bundle.
  envDir: fileURLToPath(new URL('../', import.meta.url)),
  plugins: [react()],
  define: { __STICKER_ASSETS__: JSON.stringify(readdirSync(fileURLToPath(new URL('./public/stickers/', import.meta.url))).filter(name => /\.(svg|png|webp)$/i.test(name))) },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:3001', '/dev': 'http://127.0.0.1:3001' },
  },
})
