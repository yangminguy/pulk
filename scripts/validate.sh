#!/bin/bash

# Comprehensive validation for L5 Business OS MVP

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "L5 Business OS — Full Validation Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

failed=0
passed=0

run_check() {
  local check_name=$1
  local check_cmd=$2

  echo -n "${BLUE}→${NC} $check_name: "
  if eval "$check_cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
  else
    echo -e "${RED}FAIL${NC}"
    ((failed++))
  fi
}

# Check 1: Environment
echo "Step 1: Environment Checks"
echo "────────────────────────────────────────"
run_check "Node.js installed" "node --version"
run_check "pnpm installed" "pnpm --version"
run_check "Docker available" "docker --version"
run_check ".env.example exists" "[ -f .env.example ]"
echo ""

# Check 2: Project Structure
echo "Step 2: Project Structure Checks"
echo "────────────────────────────────────────"
run_check "package.json exists" "[ -f package.json ]"
run_check "pnpm-workspace.yaml exists" "[ -f pnpm-workspace.yaml ]"
run_check "docker-compose.yml exists" "[ -f docker-compose.yml ]"
run_check "docs/ directory exists" "[ -d docs ]"
run_check "schemas/ directory exists" "[ -d schemas ]"
run_check "packages/ directory exists" "[ -d packages ]"
run_check "services/ directory exists" "[ -d services ]"
run_check "apps/ directory exists" "[ -d apps ]"
echo ""

# Check 3: Documentation
echo "Step 3: Documentation Checks"
echo "────────────────────────────────────────"
run_check "README.md exists" "[ -f README.md ]"
run_check "CLAUDE.md exists" "[ -f CLAUDE.md ]"
run_check "AGENTS.md exists" "[ -f AGENTS.md ]"
run_check "PRD.md exists" "[ -f docs/PRD.md ]"
run_check "ARCHITECTURE.md exists" "[ -f docs/ARCHITECTURE.md ]"
run_check "DATA_MODEL.md exists" "[ -f docs/DATA_MODEL.md ]"
run_check "TASKS.md exists" "[ -f docs/TASKS.md ]"
run_check "CONTEXT_INTERPRETATION.md exists" "[ -f docs/reports/CONTEXT_INTERPRETATION.md ]"
echo ""

# Check 4: Git
echo "Step 4: Git Checks"
echo "────────────────────────────────────────"
run_check "Git repository initialized" "[ -d .git ]"
run_check "Git configured with user.email" "git config user.email"
run_check "Git configured with user.name" "git config user.name"
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo -e "Results: ${GREEN}${passed} PASSED${NC}, ${RED}${failed} FAILED${NC}"
echo "═══════════════════════════════════════════════════════════════"

if [ $failed -gt 0 ]; then
  exit 1
fi

exit 0
