#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: scripts/bump-version.sh <version> (e.g. 1.0.0)}"
TAG="v${VERSION}"

# Update apps/desktop/package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('apps/desktop/package.json', 'utf8'));
  pkg.version = '${VERSION}';
  fs.writeFileSync('apps/desktop/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add apps/desktop/package.json
git commit -m "chore: bump desktop version to ${VERSION}"
git tag "${TAG}"

echo ""
echo "Version bumped to ${VERSION} and tagged ${TAG}."
echo "Run: git push --follow-tags"
