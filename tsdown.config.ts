import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import { defineConfig } from 'tsdown'

// Local, gitignored default for VAULT_PATH so a bare `npx tsdown` deploys
// straight to this machine's vault. Each machine (Windows, Mac Studio) keeps
// its own .vault-path; nothing platform-specific is tracked in the repo.
function defaultVaultPath(): string | undefined {
  const localConfig = join(__dirname, '.vault-path')
  if (!existsSync(localConfig)) return undefined
  return readFileSync(localConfig, 'utf-8').trim() || undefined
}

const prod = Boolean(process.env['PRODUCTION'])
const vaultPath = process.env['VAULT_PATH'] ?? defaultVaultPath()
const outDir = vaultPath ? `${vaultPath}/.obsidian/plugins/project-manager` : '.'

export default defineConfig({
  entry: 'src/main.ts',
  format: 'cjs',
  target: 'es2022',
  outDir,
  platform: 'node',
  dts: false,
  minify: false,
  sourcemap: prod ? false : 'inline',
  clean: false,
  hash: false,
  outExtensions: () => ({ js: '.js' }),
  define: {
    __STYLEGUIDE__: JSON.stringify(!prod || Boolean(process.env['STYLEGUIDE']))
  },
  deps: {
    neverBundle: [
      'obsidian',
      'electron',
      '@codemirror/autocomplete',
      '@codemirror/collab',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/search',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
      ...builtinModules
    ]
  }
})
