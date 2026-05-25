#!/bin/bash

# Check environment and dependencies for L5 Business OS MVP

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "L5 Business OS — Environment & Dependency Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_command() {
  if command -v "$1" &> /dev/null; then
    version=$($1 --version 2>&1 || $1 -v 2>&1 || echo "unknown")
    echo -e "${GREEN}✓${NC} $1: $version"
    return 0
  else
    echo -e "${RED}✗${NC} $1: NOT FOUND"
    return 1
  fi
}

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    return 0
  else
    echo -e "${RED}✗${NC} $1: NOT FOUND"
    return 1
  fi
}

echo "Checking Node.js and Package Managers:"
check_command "node"
check_command "npm"
check_command "pnpm"
echo ""

echo "Checking Required CLIs:"
check_command "docker"
check_command "git"
echo ""

echo "Checking TypeScript and Build Tools:"
check_command "tsc"
echo ""

echo "Checking Project Structure:"
check_file "package.json"
check_file "pnpm-workspace.yaml"
check_file "docker-compose.yml"
check_file ".env.example"
check_file "CLAUDE.md"
check_file "AGENTS.md"
echo ""

echo "Checking Documentation:"
check_file "docs/PRD.md"
check_file "docs/ARCHITECTURE.md"
check_file "docs/DATA_MODEL.md"
check_file "schemas/l5_entities.json"
echo ""

echo "Checking Environment Configuration:"
if [ -f ".env" ]; then
  echo -e "${GREEN}✓${NC} .env file exists"
else
  echo -e "${YELLOW}⚠${NC} .env file not found (using .env.example as template)"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "Environment check complete!"
echo "═══════════════════════════════════════════════════════════════"
