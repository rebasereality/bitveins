#!/usr/bin/env node
import { runBitveinsCli } from './composition-root'

declare const __BITVEINS_VERSION__: string

process.exitCode = await runBitveinsCli(
  process.argv.slice(2),
  __BITVEINS_VERSION__,
)
