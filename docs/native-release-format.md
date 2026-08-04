# Native release format

Each release archive is named:

```text
bitveins-v<semver>-linux-x64.tar.gz
bitveins-v<semver>-linux-x64.tar.gz.sha256
bitveins-v<semver>-linux-x64.tar.gz.sigstore.json
bitveins-v<semver>-linux-x64.manifest.json
```

Its root contains:

```text
bin/bitveins
lib/cli.mjs
runtime/bin/node
app/.output/
share/bitveins/release.json
share/bitveins/NODE-LICENSE
share/bitveins/THIRD_PARTY_LICENSES.json
share/bitveins/codex-marketplace/.agents/plugins/marketplace.json
share/bitveins/codex-marketplace/plugins/bitveins-notifications/.codex-plugin/plugin.json
share/bitveins/codex-marketplace/plugins/bitveins-notifications/hooks/hooks.json
share/bitveins/codex-marketplace/plugins/bitveins-notifications/hooks/bitveins_notifications.py
share/bitveins/hermes-plugin/__init__.py
share/bitveins/hermes-plugin/plugin.yaml
share/bitveins/hermes-plugin/README.md
share/bitveins/hermes-plugin/test_plugin.py
share/licenses/
share/systemd/user/bitveins.service
docs/installation.md
docs/native-release-format.md
ARCHITECTURE.md
CHANGELOG.md
CONTRIBUTING.md
SECURITY.md
LICENSE
README.md
```

`share/bitveins/release.json` records the Bitveins version, Git commit,
platform, architecture and Node version. It must exactly match the adjacent
manifest. The `.sha256` file detects transfer corruption. The
`.sigstore.json` bundle authenticates the archive digest independently.

The GitHub release workflow builds natively on Linux x86_64, executes all
quality gates, runs the Codex and Hermes plugin tests, verifies the packaged CLI and loads
both native addons using the exact Node version pinned in `.node-version`. The
archive verifier validates both plugin manifests and hook registrations,
compiles their Python, and reruns the Hermes tests from the extracted archive.
An attested build refuses a dirty source checkout. Public-repository releases
receive a GitHub SLSA v1 build-provenance attestation.

While the repository is private on a GitHub plan without private artifact
attestations, tags publish source-only GitHub releases. Native archives remain
disabled rather than being distributed without provenance. They are enabled
automatically for tags created after the repository becomes public.

Consumers accept provenance only when all of these values agree:

- Fulcio issuer `https://token.actions.githubusercontent.com`;
- repository `rebasereality/bitveins`;
- workflow `.github/workflows/release.yml`, named `Release`;
- `push` trigger on the exact `refs/tags/v<version>` ref;
- GitHub-hosted runner;
- archive filename and SHA-256 subject;
- resolved source commit and `release.json` commit.

The update CLI verifies the full SLSA statement with the official Sigstore
JavaScript implementation, including the GitHub-hosted builder and resolved
source dependency. The shell bootstrap uses a pinned Cosign binary to constrain
the signed certificate to the exact workflow, tag and commit, then requires the
authenticated archive metadata to equal the adjacent manifest. Both fail
closed when the bundle or trust service metadata is unavailable.

## Local verification

After a production build:

```bash
pnpm build:release
pnpm verify:release
```

The local verification rejects checksum mismatches, unsafe archive entries,
unsupported entry types, manifest drift, a broken CLI and unloadable native
modules. Provenance is created by GitHub only after these checks; offline
positive and negative Sigstore policy fixtures protect its consumer-side
validation.

Build and verification scripts are TypeScript checked by
`tsconfig.tools.json`. Artifact naming, manifest parsing, hashing, archive
validation, ELF inspection, license parsing and timestamp normalization use
shared typed helpers. `SOURCE_DATE_EPOCH` controls normalized archive
timestamps for reproducible builds.

## Platform policy

Only Linux x86_64 with kernel 4.18+ and glibc 2.34+ is advertised initially.
The glibc floor includes the bundled runtime and native addons; every attested
build inspects their ELF version requirements and rejects anything above 2.34.
An additional platform or architecture must have:

- a native CI runner;
- native addon loading tests;
- an artifact smoke test;
- an installer detection branch;
- explicit documentation.

Cross-compiling an archive without executing it is not sufficient.
