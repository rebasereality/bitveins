# Native installation

Bitveins is distributed as a versioned Linux x86_64 archive. The archive
contains the product CLI, the Nitro application, Node 24 and the native
`node-pty` and `better-sqlite3` modules.

No development checkout, Node installation or package manager is required.

Codex lifecycle notifications are optional and require an existing Codex CLI.
After Bitveins is installed, run `bitveins codex install`, start a new Codex
session, and trust the Bitveins definition from `/hooks`. The plugin is copied
to Bitveins' stable data directory so future Bitveins releases can update the
same local marketplace safely.

## Before installing

The host must provide:

- Linux x86_64 with kernel 4.18+ and glibc 2.34+;
- systemd with user services;
- tmux 3.1 or newer;
- `awk`, `cmp`, `curl`, `flock` (util-linux), `grep`, `sha256sum`, `tar` and standard base
  utilities for the bootstrap.

Cosign is used to authenticate the release. The bootstrap uses an existing
`cosign` command when present; otherwise it downloads the pinned Linux x86_64
Cosign version whose SHA-256 digest is embedded in the reviewed script.

Run Bitveins as the Unix user whose tmux sessions and workspaces it should
control. Do not install it as root.

## Reviewed bootstrap

Download the bootstrap separately so it can be inspected before execution:

```bash
curl -fsSLO https://github.com/rebasereality/bitveins/releases/latest/download/install.sh
less install.sh
sh install.sh
```

Set `BITVEINS_VERSION` to pin a release:

```bash
BITVEINS_VERSION=0.1.0 sh install.sh
```

The bootstrap:

1. accepts Linux x86_64 only;
2. resolves or accepts a release version;
3. downloads the archive, checksum, manifest and Sigstore bundle over HTTPS;
4. validates the checksum format and verifies it as a corruption check;
5. verifies the archive digest, GitHub OIDC identity, repository, release
   workflow, tag ref, source commit and push trigger with Cosign;
6. rejects unsafe paths, unsupported entry types and archives exceeding the
   entry-count or extracted-size limits;
7. requires packaged metadata to match the adjacent manifest exactly;
8. launches `bitveins install` from the authenticated archive.

The trusted repository is fixed to `rebasereality/bitveins`; an environment
variable cannot redirect the bootstrap to a fork. Missing attestations,
unavailable trust metadata and verification failures are fail-closed errors.
There is no checksum-only fallback.

## Manual download

For an installation without the bootstrap:

```bash
set -eu
VERSION=0.1.0
ARCHIVE="bitveins-v${VERSION}-linux-x64.tar.gz"
ROOT="bitveins-v${VERSION}-linux-x64"
MANIFEST="${ROOT}.manifest.json"
BASE="https://github.com/rebasereality/bitveins/releases/download/v${VERSION}"

curl -fL --proto '=https' --proto-redir '=https' -O "${BASE}/${ARCHIVE}"
curl -fL --proto '=https' --proto-redir '=https' -O "${BASE}/${ARCHIVE}.sha256"
curl -fL --proto '=https' --proto-redir '=https' -O "${BASE}/${MANIFEST}"
curl -fL --proto '=https' --proto-redir '=https' -O "${BASE}/${ARCHIVE}.sigstore.json"

awk -v archive="$ARCHIVE" '
  NR != 1 { exit 1 }
  {
    digest = substr($0, 1, 64)
    separator = substr($0, 65, 2)
    filename = substr($0, 67)
    if (length(digest) != 64 || digest !~ /^[0-9a-f]+$/ || separator != "  " || filename != archive) {
      exit 1
    }
  }
  END { if (NR != 1) exit 1 }
' "${ARCHIVE}.sha256"
sha256sum --check --strict "${ARCHIVE}.sha256"

COMMIT=$(awk -F '"' '
  $2 == "commit" {
    if (found) exit 1
    found = 1
    commit = $4
  }
  END {
    if (!found) exit 1
    print commit
  }
' "$MANIFEST")
printf '%s\n' "$COMMIT" | grep -Eq '^[0-9a-f]{40}$'

cosign verify-blob-attestation \
  --bundle "${ARCHIVE}.sigstore.json" \
  --certificate-identity \
  "https://github.com/rebasereality/bitveins/.github/workflows/release.yml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  --certificate-github-workflow-name Release \
  --certificate-github-workflow-repository rebasereality/bitveins \
  --certificate-github-workflow-ref "refs/tags/v${VERSION}" \
  --certificate-github-workflow-sha "$COMMIT" \
  --certificate-github-workflow-trigger push \
  --type slsaprovenance1 \
  "$ARCHIVE"

PATHS=$(mktemp)
DETAILS=$(mktemp)
trap 'rm -f "$PATHS" "$DETAILS"' EXIT HUP INT TERM
tar -tzf "$ARCHIVE" >"$PATHS"
LC_ALL=C tar -tvzf "$ARCHIVE" >"$DETAILS"
if grep -Eq '(^/|(^|/)\.\.(/|$))' "$PATHS"; then
  echo "Unsafe archive path" >&2
  exit 1
fi
if grep -Eq '^[^d-]' "$DETAILS"; then
  echo "Unsupported archive entry type" >&2
  exit 1
fi
awk '
  {
    if ($3 !~ /^[0-9]+$/) exit 1
    entries += 1
    bytes += $3
    if (entries > 100000 || bytes > 1073741824) exit 1
  }
  END { if (entries == 0) exit 1 }
' "$DETAILS"
tar -xzf "$ARCHIVE" --no-same-owner --no-same-permissions
cmp -s "$MANIFEST" "$ROOT/share/bitveins/release.json"
"./${ROOT}/bin/bitveins" install
```

`sha256sum` detects corruption but does not establish who built the archive.
The Cosign verification is the origin check and must succeed before extraction;
the commit certificate constraint and manifest comparison bind the packaged
metadata to that same workflow execution.

## Interactive installation

`bitveins install` checks the platform, tmux, systemd and the requested port. It
then:

1. asks for the Bitveins password and confirmation without terminal echo;
2. rejects weak or invalid input;
3. creates random session and local event-integration secrets;
4. generates a P-256 VAPID key pair for this self-hosted instance;
5. stores only the Scrypt password hash;
6. writes the secrets and configuration to `~/.config/bitveins/env` with permissions `0600`;
7. installs and enables `~/.config/systemd/user/bitveins.service`;
8. binds the server to `127.0.0.1`;
9. waits for an HTTP 200 health response.

`BITVEINS_EVENT_TOKEN`, `BITVEINS_VAPID_PRIVATE_KEY` and
`BITVEINS_VAPID_PUBLIC_KEY` are instance secrets/configuration generated by the
installer. The private VAPID key and Push subscription endpoints are never sent
to the browser as configuration or written to logs. Existing installations are
upgraded in place on first startup; the environment file is rewritten
atomically and remains mode `0600`.

To use a port other than 3000 or configure the future public browser origin:

```bash
bitveins install \
  --port 3456 \
  --origin https://terminal.example.com
```

For non-interactive automation, place the password in a `0600` file and use
`--password-file`. Never pass the password as a command argument or environment
variable:

```bash
bitveins install --password-file /secure/path/bitveins-password
```

## Remote access

Bitveins does not open the firewall and cannot listen on a public interface.
Connect a host-local authenticated TLS tunnel or reverse proxy to
`127.0.0.1:3000`.

The Bitveins password remains mandatory even when an upstream identity
provider such as Cloudflare Access is used.

Web Push requires the public Bitveins URL to use HTTPS. Enable it per device in
Settings. Browser permission denial must be reversed in browser or operating
system settings. Safari on iOS/iPadOS supports Web Push only for Home Screen
installed web apps. To reset one device, use **Disable on this device**; removing
site data or browser notification permission also invalidates that browser
subscription.

If the public URL was not provided during installation, update
`BITVEINS_ALLOWED_ORIGINS` in `~/.config/bitveins/env`, then run:

```bash
bitveins restart
bitveins doctor
```

## Service lifetime

The installer enables a systemd user service. On a server where Bitveins must
start before login and remain active after logout, enable lingering explicitly:

```bash
sudo loginctl enable-linger "$USER"
```

The installer reports when lingering is disabled but never invokes sudo.

## Recovery

Start with:

```bash
bitveins doctor
bitveins status
bitveins logs
```

`bitveins doctor` checks configuration permissions, required commands, release
metadata, systemd state, disk space, health and loopback-only listening.
Use `bitveins <command> --help` for command-specific options. Expected errors
print an actionable message and optional hint without a stack trace;
`--verbose` adds redacted cause stacks for diagnosis.

Exit codes are `0` success, `1` operation failure, `2` usage error, `3`
unhealthy doctor result, `4` prerequisite/configuration/service failure and `5`
release integrity or provenance failure.

Changing the password is transactional:

```bash
bitveins password
```

The previous configuration is restored if the new service cannot become
healthy.

## Updating and rollback

```bash
bitveins update
bitveins update --version 0.2.0
```

Updates are downloaded to a temporary directory, checksum-verified, installed
beside the current release and authenticated with the same Sigstore policy as
the bootstrap before extraction. Activation uses an atomic `current` symlink
and an explicit activation history. Bitveins retains exactly the current and
previous functional release. If restart or health verification fails, it
restores the previous configuration, service unit and release.

Updates preserve the SQLite inbox, Push subscriptions, VAPID identity and local
integration token. Rollback therefore keeps subscriptions usable. Default
uninstall preserves the same configuration and database; `--purge` removes
both, permanently resetting Agent Inbox and notification subscriptions. Include
`~/.config/bitveins/env` and `~/.local/share/bitveins/history.sqlite` together in
backups so restored subscriptions retain their matching VAPID keys.

Trust-policy changes are release changes: the fixed repository, workflow path,
OIDC issuer or Cosign pin must be reviewed in source, tested and shipped
together. Users should never bypass a failed attestation to force an update.

## Uninstalling

The default operation keeps configuration and history:

```bash
bitveins uninstall
```

To remove those as well:

```bash
bitveins uninstall --purge
```

The purge requires typing `REMOVE`. It deletes only the resolved Bitveins XDG
directories and refuses ambiguous or parent paths. Neither operation kills
ordinary tmux sessions.
