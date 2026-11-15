#!/bin/bash
# Vercel "Ignored Build Step" — exit 0 skips the build, non-zero builds.
# Skips deploys that only touch files the website doesn't serve:
# android/, capacitor-web/, scripts/, docs, markdown, agent config.
# Anything under src/, public/, drizzle/, or root config files builds.
#
# Fails OPEN: any git error or unexpected state exits 1 (build) — a skipped
# deploy is silent, a wasted build only costs minutes.

set -u

if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  exit 1 # first commit / shallow clone — build
fi

changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null) || exit 1
[ -z "$changed" ] && exit 1 # empty diff — build (shouldn't happen)

# Any changed file OUTSIDE the exempt list => build.
if printf '%s\n' "$changed" | grep -qvE '^(android/|capacitor-web/|scripts/|\.devin/|\.agents/|docs/)|\.md$'; then
  exit 1
fi

exit 0
