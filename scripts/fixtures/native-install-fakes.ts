export const fakeSystemctl = `#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { openSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const state = process.env.BITVEINS_FAKE_SYSTEMD_STATE
const home = process.env.HOME
const installRoot = process.env.BITVEINS_INSTALL_ROOT
const pidFile = join(state, 'pid')
const logFile = join(state, 'server.log')
const failedRestartFile = join(state, 'failed-restart')
const args = process.argv.slice(2).filter(value => value !== '--user')

function environment() {
  const values = { ...process.env }
  const content = readFileSync(join(home, '.config', 'bitveins', 'env'), 'utf8')
  for (const line of content.split(/\\r?\\n/)) {
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    values[line.slice(0, separator)] = JSON.parse(line.slice(separator + 1))
  }
  values.NODE_ENV = 'production'
  values.HOST = '127.0.0.1'
  return values
}

function active() {
  if (!existsSync(pidFile)) return false
  try {
    process.kill(Number(readFileSync(pidFile, 'utf8')), 0)
    return true
  }
  catch {
    return false
  }
}

function stop() {
  if (active()) process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGTERM')
  rmSync(pidFile, { force: true })
}

function start() {
  if (active()) return
  const output = openSync(logFile, 'a')
  const child = spawn(
    join(installRoot, 'current', 'runtime', 'bin', 'node'),
    [join(installRoot, 'current', 'app', '.output', 'server', 'index.mjs')],
    { detached: true, env: environment(), stdio: ['ignore', output, output] },
  )
  child.unref()
  writeFileSync(pidFile, String(child.pid), { mode: 0o600 })
}

const action = args[0]
if (action === 'daemon-reload') process.exit(0)
if (action === 'show') {
  process.stdout.write('loaded\\n')
  process.exit(0)
}
if (action === 'enable' || action === 'start') {
  start()
  process.exit(0)
}
if (action === 'restart') {
  stop()
  if (
    process.env.BITVEINS_SMOKE_FAIL_NEXT_RESTART === '1'
    && !existsSync(failedRestartFile)
  ) {
    writeFileSync(failedRestartFile, 'failed once', { mode: 0o600 })
    process.exit(0)
  }
  setTimeout(() => {
    start()
    process.exit(0)
  }, 100)
}
else if (action === 'stop' || action === 'disable') {
  stop()
  process.exit(0)
}
else if (action === 'is-active') {
  process.exit(active() ? 0 : 3)
}
else if (action === 'status') {
  process.stdout.write(active() ? 'active (running)\\n' : 'inactive\\n')
  process.exit(active() ? 0 : 3)
}
else {
  process.stderr.write('Unsupported fake systemctl action: ' + args.join(' ') + '\\n')
  process.exit(2)
}
`

export const fakeJournalctl = `#!/bin/sh
echo "fake Bitveins journal"
`

export const fakeCurl = `#!/bin/sh
set -eu

output=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      output=$2
      shift 2
      ;;
    -H|--max-filesize|--proto|--proto-redir)
      shift 2
      ;;
    -fL|-fsSL|--tlsv1.2)
      shift
      ;;
    *)
      url=$1
      shift
      ;;
  esac
done

case "$url" in
  https://api.github.com/repos/rebasereality/bitveins/releases/latest)
    printf '{"tag_name":"v%s"}\\n' "$BITVEINS_SMOKE_LATEST_VERSION"
    ;;
  *.sigstore.json)
    cp "$BITVEINS_SMOKE_ATTESTATION" "$output"
    ;;
  *.manifest.json)
    cp "$BITVEINS_SMOKE_MANIFEST" "$output"
    ;;
  *.sha256)
    cp "$BITVEINS_SMOKE_CHECKSUM" "$output"
    ;;
  *.tar.gz)
    cp "$BITVEINS_SMOKE_ARCHIVE" "$output"
    ;;
  *)
    echo "Unexpected bootstrap URL: $url" >&2
    exit 2
    ;;
esac
`

export const fakeCosign = `#!/bin/sh
set -eu

if [ "\${BITVEINS_SMOKE_PROVENANCE_INVALID:-}" = "1" ]; then
  echo "invalid provenance" >&2
  exit 1
fi

case " $* " in
  *" verify-blob-attestation "*" --certificate-github-workflow-repository rebasereality/bitveins "*" --certificate-github-workflow-sha "*" --type slsaprovenance1 "*)
    exit 0
    ;;
  *)
    echo "Bootstrap did not enforce the expected provenance policy." >&2
    exit 2
    ;;
esac
`
