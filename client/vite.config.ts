import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  define: { __STICKER_ASSETS__: JSON.stringify(readdirSync(fileURLToPath(new URL('./public/stickers/', import.meta.url))).filter(name => name.endsWith('.svg'))) },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:3001', '/dev': 'http://127.0.0.1:3001' },
  },
})
