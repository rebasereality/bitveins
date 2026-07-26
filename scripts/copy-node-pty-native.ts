import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nodePtyPackage = require.resolve('node-pty/package.json')
const nodePtyRoot = dirname(nodePtyPackage)
const source = join(nodePtyRoot, 'build/Release/pty.node')
const target = new URL('../.output/server/node_modules/node-pty/build/Release/pty.node', import.meta.url)

mkdirSync(dirname(target.pathname), { recursive: true })
copyFileSync(source, target)
// eslint-disable-next-line no-console
console.log(`Copied ${source} -> ${target.pathname}`)
