import type { InstallationLayout } from '../core/installation-layout'

function quoteSystemd(value: string): string {
  if (/[\n\r\0]/u.test(value)) {
    throw new Error('A systemd path contains an unsupported character.')
  }

  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('%', '%%')}"`
}

function escapeSystemdPath(value: string): string {
  if (!value.startsWith('/') || /[\n\r\0]/u.test(value)) {
    throw new Error('A systemd path must be absolute and contain no control characters.')
  }

  return [...Buffer.from(value)]
    .map((byte) => {
      if (byte === 0x25) {
        return '%%'
      }
      if (
        (byte >= 0x30 && byte <= 0x39)
        || (byte >= 0x41 && byte <= 0x5a)
        || (byte >= 0x61 && byte <= 0x7a)
        || [0x2f, 0x2d, 0x2e, 0x5f].includes(byte)
      ) {
        return String.fromCharCode(byte)
      }
      return `\\x${byte.toString(16).padStart(2, '0')}`
    })
    .join('')
}

export function renderSystemdUserUnit(layout: InstallationLayout, home: string): string {
  const node = `${layout.currentReleaseLink}/runtime/bin/node`
  const server = `${layout.currentReleaseLink}/app/.output/server/index.mjs`

  return `[Unit]
Description=Bitveins Async Terminal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${escapeSystemdPath(home)}
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
EnvironmentFile=${escapeSystemdPath(layout.environmentFile)}
ExecStart=${quoteSystemd(node)} ${quoteSystemd(server)}
Restart=on-failure
RestartSec=5s
KillMode=process

[Install]
WantedBy=default.target
`
}
