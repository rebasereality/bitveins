# Security policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security-advisory form for this repository and include:

- the affected route or component;
- reproduction steps and expected impact;
- any suggested mitigation;
- whether the issue has been disclosed elsewhere.

Maintainers should acknowledge a complete report within seven days. Public
disclosure and credit are coordinated after a fix is available.

## Deployment boundary

Bitveins exposes a shell, local files, and tmux sessions by design. It is not a
multi-tenant sandbox. Bind it to `127.0.0.1`, keep an authenticated TLS tunnel
or reverse proxy in front of it, use strong independent Bitveins credentials,
and protect the host account with normal operating-system controls.

The native installer enforces a mandatory Bitveins password, stores only its
Scrypt hash, generates the sealed-session secret, writes configuration with
permissions `0600` and creates a loopback-only systemd user service. Production
startup rejects missing secrets and any `HOST` other than `127.0.0.1`.

Explorer file access remains inside the selected tmux session workspace.
Lexical paths and canonical paths are both checked, including symlink targets.
Raster preview responses accept only sniffed PNG, JPEG, GIF, WebP or AVIF
content, reject non-regular and oversized files, and set `nosniff`, `no-store`
and a restrictive CSP. SVG is intentionally not rendered. Relative terminal
paths are resolved through bounded project discovery; ambiguous matches require
an explicit browser-side choice.

Release archives are accompanied by SHA-256 checksums and Sigstore bundles.
SHA-256 is a corruption check, not proof of origin. Installation and update
fail closed unless the archive digest is attested by GitHub's OIDC issuer for
the fixed `rebasereality/bitveins` repository, `Release` workflow, exact
version tag, push trigger and GitHub-hosted runner. The attested source commit
must match the packaged release metadata.

The reviewed bootstrap uses an existing Cosign command or downloads the exact
pinned Cosign Linux binary and checks its embedded SHA-256 before use. The
bootstrap additionally constrains the workflow commit from the release manifest
and requires that manifest to equal the packaged metadata. The product CLI uses
the official Sigstore JavaScript verifier to validate the complete SLSA
statement and GitHub-hosted builder. Neither path falls back to checksum-only
installation if the attestation is missing, malformed, unavailable or belongs
to a fork.

Trust rotation is a security-sensitive release change. Changes to the
repository, workflow path/name, OIDC issuer, Cosign version/digest or Sigstore
dependency require review, negative policy tests and synchronized updates to
the bootstrap, CLI and release workflow. Prefer a pinned Bitveins version and
inspect the bootstrap before execution.
