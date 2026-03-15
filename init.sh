#!/usr/bin/env bash
set -euo pipefail

echo "╔══════════════════════════════════════════════════════╗"
echo "║        Fleet Command Agents System - Setup           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check Node.js version
echo "→ Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo "✗ Node.js is not installed. Please install Node.js 20+ first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "✗ Node.js 20+ required. Found: $(node -v)"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# Check Git
echo "→ Checking Git..."
if ! command -v git &> /dev/null; then
  echo "✗ Git is not installed. Please install Git first."
  exit 1
fi
echo "✓ Git $(git --version | awk '{print $3}')"

# Check Claude Code CLI (optional but recommended)
echo "→ Checking Claude Code CLI..."
if command -v claude &> /dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
  echo "✓ Claude CLI found: $CLAUDE_VERSION"
else
  echo "⚠ Claude Code CLI not found in PATH."
  echo "  Install it from: https://docs.anthropic.com/en/docs/claude-code"
  echo "  The app will guide you through setup on first launch."
fi

echo ""

# Install dependencies
echo "→ Installing dependencies..."
npm install
echo "✓ Dependencies installed"

echo ""

# Build the project
echo "→ Building project..."
npm run build:renderer 2>/dev/null || echo "⚠ Build step skipped (run 'npm run dev' for development)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Setup complete! To run the application:"
echo ""
echo "  Development mode (with hot reload):"
echo "    npm run dev:electron"
echo ""
echo "  Or start the renderer dev server only:"
echo "    npm run dev"
echo ""
echo "  Production build:"
echo "    npm run build"
echo ""
echo "  The app will be available at:"
echo "    http://localhost:5173 (renderer dev server)"
echo ""
echo "═══════════════════════════════════════════════════════"
