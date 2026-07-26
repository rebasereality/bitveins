#!/bin/sh
set -eu

BITVEINS_REPOSITORY=rebasereality/bitveins
BITVEINS_VERSION=${BITVEINS_VERSION:-}
BITVEINS_COSIGN_VERSION=3.1.2
BITVEINS_COSIGN_SHA256=f7622ed3cf22e55e1ae6377c080979ff77a22da9981c11df222a2e444991e7cf
BITVEINS_MAX_ARCHIVE_ENTRIES=100000
BITVEINS_MAX_EXTRACTED_BYTES=1073741824

if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  echo "Bitveins currently supports Linux x86_64 only." >&2
  exit 1
fi

for BITVEINS_COMMAND in awk chmod cmp curl getconf grep head mktemp rm sed sha256sum tar; do
  if ! command -v "$BITVEINS_COMMAND" >/dev/null 2>&1; then
    echo "$BITVEINS_COMMAND is required to install Bitveins." >&2
    exit 1
  fi
done

if ! BITVEINS_GLIBC_INFO=$(getconf GNU_LIBC_VERSION 2>/dev/null); then
  echo "Bitveins requires glibc 2.34 or newer." >&2
  exit 1
fi
BITVEINS_GLIBC_VERSION=${BITVEINS_GLIBC_INFO#glibc }
if [ "$BITVEINS_GLIBC_VERSION" = "$BITVEINS_GLIBC_INFO" ] ||
  ! awk -v version="$BITVEINS_GLIBC_VERSION" '
    BEGIN {
      split(version, parts, ".")
      exit !(parts[1] > 2 || (parts[1] == 2 && parts[2] >= 34))
    }
  '; then
  echo "Bitveins requires glibc 2.34 or newer." >&2
  exit 1
fi

if [ -z "$BITVEINS_VERSION" ]; then
  BITVEINS_VERSION=$(
    curl -fsSL \
      --proto '=https' \
      --proto-redir '=https' \
      --tlsv1.2 \
      --max-filesize 1048576 \
      -H "Accept: application/vnd.github+json" \
      -H "User-Agent: bitveins-installer" \
      "https://api.github.com/repos/$BITVEINS_REPOSITORY/releases/latest" |
      sed -n 's/.*"tag_name":[[:space:]]*"v\([^"]*\)".*/\1/p' |
      head -n 1
  )
fi

if ! printf '%s\n' "$BITVEINS_VERSION" |
  grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "Unable to resolve a valid Bitveins version." >&2
  exit 1
fi

BITVEINS_ARCHIVE="bitveins-v$BITVEINS_VERSION-linux-x64.tar.gz"
BITVEINS_ARCHIVE_ROOT="bitveins-v$BITVEINS_VERSION-linux-x64"
BITVEINS_RELEASE_URL="https://github.com/$BITVEINS_REPOSITORY/releases/download/v$BITVEINS_VERSION"
BITVEINS_TEMPORARY_DIRECTORY=$(mktemp -d)
trap 'rm -rf "$BITVEINS_TEMPORARY_DIRECTORY"' EXIT HUP INT TERM

curl -fL --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --max-filesize 536870912 \
  "$BITVEINS_RELEASE_URL/$BITVEINS_ARCHIVE" \
  -o "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE"
curl -fL --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --max-filesize 1048576 \
  "$BITVEINS_RELEASE_URL/$BITVEINS_ARCHIVE.sha256" \
  -o "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE.sha256"
curl -fL --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --max-filesize 1048576 \
  "$BITVEINS_RELEASE_URL/$BITVEINS_ARCHIVE_ROOT.manifest.json" \
  -o "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE_ROOT.manifest.json"
curl -fL --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --max-filesize 2097152 \
  "$BITVEINS_RELEASE_URL/$BITVEINS_ARCHIVE.sigstore.json" \
  -o "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE.sigstore.json"

if ! awk -v archive="$BITVEINS_ARCHIVE" '
  NR != 1 {
    exit 1
  }
  {
    digest = substr($0, 1, 64)
    separator = substr($0, 65, 2)
    filename = substr($0, 67)
    if (length(digest) != 64 || digest !~ /^[0-9a-f]+$/ || separator != "  " || filename != archive) {
      exit 1
    }
  }
  END {
    if (NR != 1) {
      exit 1
    }
  }
' "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE.sha256"; then
  echo "The Bitveins checksum file has an invalid format." >&2
  exit 1
fi

if ! BITVEINS_COMMIT=$(awk -F '"' '
  $2 == "commit" {
    if (found) {
      exit 1
    }
    found = 1
    commit = $4
  }
  END {
    if (!found) {
      exit 1
    }
    print commit
  }
' "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE_ROOT.manifest.json"); then
  echo "The Bitveins release manifest has an invalid commit." >&2
  exit 1
fi
if [ "$BITVEINS_COMMIT" != "unknown" ] &&
  ! printf '%s\n' "$BITVEINS_COMMIT" |
    grep -Eq '^[0-9a-f]{40}$'; then
  echo "The Bitveins release manifest has an invalid commit." >&2
  exit 1
fi

(
  cd "$BITVEINS_TEMPORARY_DIRECTORY"
  sha256sum --check --strict "$BITVEINS_ARCHIVE.sha256"
)

if BITVEINS_COSIGN=$(command -v cosign 2>/dev/null); then
  :
else
  BITVEINS_COSIGN="$BITVEINS_TEMPORARY_DIRECTORY/cosign"
  curl -fL --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --max-filesize 157286400 \
    "https://github.com/sigstore/cosign/releases/download/v$BITVEINS_COSIGN_VERSION/cosign-linux-amd64" \
    -o "$BITVEINS_COSIGN"
  printf '%s  %s\n' \
    "$BITVEINS_COSIGN_SHA256" \
    "$BITVEINS_COSIGN" |
    sha256sum --check --strict
  chmod 0700 "$BITVEINS_COSIGN"
fi

"$BITVEINS_COSIGN" verify-blob-attestation \
  --bundle "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE.sigstore.json" \
  --certificate-identity \
  "https://github.com/$BITVEINS_REPOSITORY/.github/workflows/release.yml@refs/tags/v$BITVEINS_VERSION" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  --certificate-github-workflow-name Release \
  --certificate-github-workflow-repository "$BITVEINS_REPOSITORY" \
  --certificate-github-workflow-ref "refs/tags/v$BITVEINS_VERSION" \
  --certificate-github-workflow-sha "$BITVEINS_COMMIT" \
  --certificate-github-workflow-trigger push \
  --type slsaprovenance1 \
  "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE"

BITVEINS_ARCHIVE_PATHS="$BITVEINS_TEMPORARY_DIRECTORY/archive-paths"
BITVEINS_ARCHIVE_DETAILS="$BITVEINS_TEMPORARY_DIRECTORY/archive-details"
if ! tar -tzf "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE" \
  >"$BITVEINS_ARCHIVE_PATHS"; then
  echo "The Bitveins archive cannot be listed safely." >&2
  exit 1
fi
if ! LC_ALL=C tar -tvzf "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE" \
  >"$BITVEINS_ARCHIVE_DETAILS"; then
  echo "The Bitveins archive metadata is invalid." >&2
  exit 1
fi

if grep -Eq '(^/|(^|/)\.\.(/|$))' "$BITVEINS_ARCHIVE_PATHS"; then
  echo "The Bitveins archive contains an unsafe path." >&2
  exit 1
fi

if grep -Eq '^[^d-]' "$BITVEINS_ARCHIVE_DETAILS"; then
  echo "The Bitveins archive contains an unsupported entry type." >&2
  exit 1
fi

if ! awk \
  -v max_entries="$BITVEINS_MAX_ARCHIVE_ENTRIES" \
  -v max_bytes="$BITVEINS_MAX_EXTRACTED_BYTES" '
    {
      if ($3 !~ /^[0-9]+$/) {
        exit 1
      }
      entries += 1
      bytes += $3
      if (entries > max_entries || bytes > max_bytes) {
        exit 1
      }
    }
    END {
      if (entries == 0) {
        exit 1
      }
    }
  ' "$BITVEINS_ARCHIVE_DETAILS"; then
  echo "The Bitveins archive exceeds safe extraction limits." >&2
  exit 1
fi

tar -xzf "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE" \
  --no-same-owner --no-same-permissions \
  -C "$BITVEINS_TEMPORARY_DIRECTORY"

if ! cmp -s \
  "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE_ROOT.manifest.json" \
  "$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE_ROOT/share/bitveins/release.json"; then
  echo "The Bitveins archive metadata does not match its release manifest." >&2
  exit 1
fi

"$BITVEINS_TEMPORARY_DIRECTORY/$BITVEINS_ARCHIVE_ROOT/bin/bitveins" \
  install "$@"
