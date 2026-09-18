import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))

function collectSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) collectSourceFiles(path, files)
    else if (/\.(vue|js)$/.test(entry.name)) files.push(path)
  }
  return files
}

function fluentIconSubset() {
  const virtualId = '\0virtual:fluent-icons'
  return {
    name: 'cyrene-fluent-icon-subset',
    resolveId(id) {
      if (id === 'virtual:fluent-icons') return virtualId
    },
    load(id) {
      if (id !== virtualId) return
      const source = JSON.parse(readFileSync(resolve(projectRoot, 'node_modules/@iconify-json/fluent/icons.json'), 'utf8'))
      const names = new Set()
      const pattern = /['"`](?:fluent:)?([a-z0-9][a-z0-9-]*(?:-16|-20|-24|-28|-32)?-(?:regular|filled))['"`]/g
      for (const file of collectSourceFiles(resolve(projectRoot, 'src'))) {
        const content = readFileSync(file, 'utf8')
        for (const match of content.matchAll(pattern)) names.add(match[1])
      }
      for (const file of collectSourceFiles(resolve(projectRoot, 'node_modules/vue-fluent-widgets/dist'), [])) {
        const content = readFileSync(file, 'utf8')
        for (const match of content.matchAll(pattern)) {
          const name = match[1]
          if (source.icons[name] || source.aliases?.[name]) names.add(name)
        }
      }
      const icons = {}
      const aliases = {}
      const addIcon = name => {
        if (source.icons[name]) {
          icons[name] = source.icons[name]
          return
        }
        const alias = source.aliases?.[name]
        if (!alias) throw new Error(`Unknown Fluent icon: ${name}`)
        aliases[name] = alias
        addIcon(alias.parent)
      }
      names.forEach(addIcon)
      const subset = { prefix: source.prefix, width: source.width, height: source.height, icons, aliases }
      return `export default ${JSON.stringify(subset)}`
    }
  }
}

const now = new Date()
const fallbackBuildHash = `${String(now.getFullYear() % 100).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`

let buildHash = fallbackBuildHash
try {
  const commit = execSync('git rev-parse --short HEAD', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (commit) buildHash = commit
} catch {
  buildHash = fallbackBuildHash
}

export default defineConfig({
  base: './',
  plugins: [fluentIconSubset(), vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia', 'vue-fluent-widgets'],
          gsap: ['gsap']
        }
      }
    }
  },
  server: {
    port: 5173
  },
  json: {
    stringify: true
  },
  define: {
    '__BUILD_HASH__': JSON.stringify(buildHash)
  }
})
