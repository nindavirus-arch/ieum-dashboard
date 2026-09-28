import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildId = new Date().toISOString()

await mkdir(path.resolve(root, 'public'), { recursive: true })
await writeFile(
  path.resolve(root, 'public', 'version.json'),
  `${JSON.stringify({ buildId })}\n`,
  'utf8',
)

await build(defineConfig({
  root,
  configFile: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
}))
