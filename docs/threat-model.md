# Bitveins threat model

## Scope and trust boundary

Bitveins is a single-user administrative tool. An authenticated browser can
control tmux, execute terminal input, and access files below a selected session
workspace. Authentication is an authorization boundary; tmux is not a sandbox.

The supported topology is:

`browser -> authenticated TLS tunnel/proxy -> 127.0.0.1 Bitveins -> tmux/files`

Direct public port exposure and mutually untrusted users are out of scope.

## Protected assets

- terminal input and output;
- tmux sessions and their processes;
- files below session workspaces;
- async prompt history;
- sealed session and password-hash secrets.

## Primary threats and controls

| Threat | Control | Residual risk |
| --- | --- | --- |
| Unauthenticated API or WebSocket access | Deny-by-default API middleware and sealed-session checks on upgrades | A compromised authenticated browser has full user-level capability |
| Cross-site requests | Exact origin allowlist, sealed HTTP-only cookies, response hardening headers | Non-browser clients do not send `Origin`; loopback isolation remains required |
| Path traversal or symlink escape | Canonical workspace resolver checks lexical paths, real paths and existing ancestors | Files can change between validation and use on a hostile local filesystem |
| Active or spoofed image content | Magic-byte raster allowlist, regular-file and 50 MiB limits, `nosniff`, restrictive CSP and no SVG rendering | Browser decoder vulnerabilities remain in the browser trust boundary |
| Unbounded project discovery | Session confinement, ignored noisy directories, depth/directory/time bounds and a short cache | A deliberately adversarial workspace can consume work up to those bounds |
| Ambiguous relative path | Canonical deduplication and explicit root choice unless the user opted into a per-window preference | A remembered root intentionally changes future resolution for that window |
| Command injection | `execFile` argument arrays and validated tmux identifiers | tmux itself and commands entered by the user remain trusted capabilities |
| Oversized input | Zod DTO limits, 5 MiB editor limit and 50 MiB upload limit | Terminal output can still be voluminous |
| Password guessing | Login throttling plus upstream identity perimeter | In-memory counters reset on process restart |
| Clickjacking or content sniffing | `frame-ancestors`, `X-Frame-Options`, `nosniff` and restrictive permissions policy | Browser extensions retain their normal privileges |
| First-run takeover | CLI requires password creation before the service is started | A weak host account can still modify the service configuration |
| Release tampering | HTTPS, bounded downloads, SHA-256 corruption check, strict extraction and mandatory Sigstore provenance bound to repository/workflow/tag/commit | A compromised trusted workflow, GitHub account or root of trust remains a supply-chain risk |
| Fork substitution | Fixed repository identity in bootstrap and CLI; exact Fulcio SAN and GitHub OIDC extensions | A reviewed trust-policy change can intentionally move this boundary |
| Archive bomb or traversal | Redirect, byte, entry-count, extracted-size, path and entry-type limits before extraction | Resource exhaustion inside the documented bounds remains possible |
| Unsafe update | Versioned immutable releases, explicit activation history, atomic symlink switch, health check and transactional rollback | A simultaneous operation is rejected; a double rollback failure may require manual recovery |

## Secret handling

Production startup fails if `NUXT_SESSION_PASSWORD` is shorter than 32
characters or if `BITVEINS_AUTH_PASSWORD_HASH` is missing. Secrets belong in
the service environment, never in source control or client-side runtime config.
Changing `BITVEINS_AUTH_VERSION` revokes existing sessions.

The installer never accepts the password as a command argument. Interactive
input is read without echo; automation uses a private password file. Config is
written atomically with mode `0600`.

## Release trust boundary

The distribution path has two independent checks:

1. the adjacent SHA-256 file detects corruption;
2. the Sigstore bundle authenticates that exact digest as an output of the
   trusted GitHub-hosted release workflow on the exact version tag.

The bootstrap cannot use the untrusted archive to authenticate itself. It uses
Cosign from the host trust boundary or downloads a separately pinned Cosign
binary whose digest is embedded in `install.sh`. The CLI uses Sigstore trust
roots and verifies the in-toto/SLSA statement, archive subject, repository,
workflow, ref, trigger, runner environment and source commit. Any absent or
unavailable verification material aborts installation or update.
The bootstrap constrains Cosign to the same workflow certificate, tag and
manifest commit before extraction, then requires the packaged release metadata
to match that manifest.

The bootstrap script remains an initial trust root and should be downloaded,
reviewed and pinned by high-assurance operators. A compromise of the GitHub
release workflow, maintainer account, Sigstore roots or the source distribution
of `install.sh` is residual supply-chain risk.

## Security verification

The test suite covers authentication policy, origin logic, path confinement,
symlink escapes, raster signatures and limits, ambiguous project roots, upload
limits, runtime message validation and production environment checks.
After deployment, verify that authenticated session status returns HTTP 200 on
`127.0.0.1`, sensitive routes return HTTP 401 without a cookie, and the process
does not listen on a public interface.

The authenticated browser flow also previews a confined image through a
modified xterm link, chooses an ambiguous project root, exercises opt-in
per-window memory and forgets that preference.

Installer tests additionally cover XDG confinement, password handling,
configuration permissions, update rollback boundaries, checksum and provenance
failures, fork substitution, bounded archive extraction and safe uninstall
targets. The authenticated Playwright flow creates, renames, attaches to and
deletes a session on an isolated tmux socket.
