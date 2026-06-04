#!/usr/bin/env bash
set -euo pipefail

FAIL=0
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# G1: No commercial NocoBase plugins
node -e "
  const fs = require('fs');
  const path = require('path');
  const repoRoot = '$REPO_ROOT';
  const whitelist = ['@nocobase/plugin-acl', '@nocobase/plugin-auth', '@nocobase/plugin-client', '@nocobase/plugin-error-handler'];
  
  function checkPkg(pkgPath) {
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const plugins = Object.keys(deps).filter(d => d.startsWith('@nocobase/plugin-'));
    const banned = plugins.filter(d => !whitelist.includes(d));
    if (banned.length > 0) {
      console.log('FAIL: G1 — Unauthorized NocoBase plugin in ' + pkgPath + ': ' + banned.join(', '));
      return true;
    }
    return false;
  }

  let fail = false;
  // Read all package.jsons in the repo to be comprehensive
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git') continue;
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walkDir(fullPath);
      } else if (file === 'package.json') {
        if (checkPkg(fullPath)) fail = true;
      }
    }
  }
  walkDir(repoRoot);
  
  if (fail) process.exit(1);
" || FAIL=1

# G2: No paid automation dependency
BANNED_PATTERNS=("nocobase-commercial" "activepieces-enterprise" "trigger.dev-pro")
for pattern in "${BANNED_PATTERNS[@]}"; do
  if grep -rq "$pattern" "$REPO_ROOT"/apps/*/package.json "$REPO_ROOT"/packages/*/package.json "$REPO_ROOT"/services/*/package.json 2>/dev/null; then
    echo "FAIL: G2 — banned dependency '$pattern' detected"
    FAIL=1
  fi
done

# G3: posthog/openpanel not in production dependencies
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const analytics = deps.filter(d => /posthog|openpanel/i.test(d));
  if (analytics.length) { console.log('FAIL: G3 — ' + analytics.join(', ')); process.exit(1); }
" || FAIL=1

# G4: License audit (when license-checker is available)
if command -v license-checker &>/dev/null; then
  cd "$REPO_ROOT"
  license-checker --onlyAllow "MIT;Apache-2.0;ISC;BSD-2-Clause;BSD-3-Clause;0BSD;CC0-1.0;Unlicense;Python-2.0;BlueOak-1.0.0;AGPL-3.0-or-later" --production || FAIL=1
else
  echo "SKIP: G4 — license-checker not installed (npm i -g license-checker-evergreen)"
fi

exit $FAIL
