import { mkdir, readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const version = process.env.BITVEINS_VERSION || packageJson.version
const outputDirectory = new URL('../.bitveins-build/cli/', import.meta.url)

await mkdir(outputDirectory, { recursive: true })
await build({
  banner: {
    js: 'import { createRequire as __bitveinsCreateRequire } from "node:module"; const require = __bitveinsCreateRequire(import.meta.url);',
  },
  bundle: true,
  define: {
    __BITVEINS_VERSION__: JSON.stringify(version),
  },
  entryPoints: [new URL('../cli/index.ts', import.meta.url).pathname],
  format: 'esm',
  legalComments: 'none',
  outfile: new URL('index.mjs', outputDirectory).pathname,
  platform: 'node',
  sourcemap: true,
  target: 'node24',
})

// eslint-disable-next-line no-console
console.log(`Built Bitveins CLI ${version}`)
