# Fleet Command Agents System

A multi-agent AI coding orchestration desktop application powered by Claude Code CLI. Fleet Command brings multi-agent AI coordination to a polished graphical interface, enabling users to spawn, coordinate, and monitor swarms of AI coding agents through a beautiful dark-themed UI.

## Overview

Fleet Command replaces tmux-based terminal management with Electron-managed processes using `node-pty`, providing:

- **Agent Orchestration** – Spawn and manage scouts, builders, reviewers, leads, mergers, and coordinators
- **Visual Hierarchy** – Tree visualization of coordinator → leads → workers with status colors
- **Mail System** – Inter-agent messaging with semantic and protocol message types
- **Merge Pipeline** – 4-tier conflict resolution: clean → auto-resolve → AI-resolve → reimagine
- **Worktree Management** – Visual git worktree manager per agent
- **Command Palette** – Ctrl+K power-user interface for all actions
- **Watchdog System** – 3-tier health monitoring with progressive nudging
- **Debug Tools** – Built-in terminal, log viewer, event timeline, error aggregation
- **Desktop Notifications** – Electron native notifications for agent events

## Prerequisites

- **Node.js 20+**
- **Git** installed and configured
- **Claude Code CLI** installed and authenticated (OAuth subscription)
- Windows, macOS, or Linux

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd Fleet-Command-Agents-System

# Run the setup script
chmod +x init.sh
./init.sh

# Start in development mode
npm run dev:electron
```

## Development

```bash
# Start renderer dev server only (Vite)
npm run dev

# Start full Electron dev mode (renderer + main process)
npm run dev:electron

# Type checking
npm run typecheck

# Linting and formatting (Biome)
npm run lint
npm run lint:fix
npm run format
```

## Building

```bash
# Full production build
npm run build

# Output: release/ directory with platform-specific installers
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron + electron-builder (NSIS installer) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + Shadcn/ui |
| State | Zustand + TanStack Query |
| Routing | TanStack Router |
| Tables | @tanstack/react-table |
| Terminal | xterm.js + node-pty |
| Database | better-sqlite3 + drizzle-orm (WAL mode) |
| Process Mgmt | node-pty + tree-kill |
| Git | simple-git (worktrees, branches) |
| Animations | Framer Motion |
| Command Palette | cmdk |
| Diff Viewer | diff2html |
| Linting | Biome |

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, window management, tray
│   ├── db/            # SQLite database (better-sqlite3 + drizzle)
│   ├── ipc/           # IPC handlers (contextBridge API)
│   ├── agents/        # Agent process management (node-pty)
│   └── services/      # Business logic services
├── preload/           # Secure preload scripts (contextBridge)
│   └── index.ts       # Exposed IPC API surface
├── renderer/          # React frontend
│   ├── main.tsx       # React entry point
│   ├── App.tsx        # Root component with providers
│   ├── components/    # Reusable UI components
│   ├── pages/         # Page-level components
│   ├── stores/        # Zustand state stores
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Utility functions
│   └── styles/        # Global CSS + Tailwind
└── shared/            # Shared types and schemas
    ├── types/         # TypeScript type definitions
    └── schemas/       # Zod validation schemas
```

## Architecture

Fleet Command is an Electron desktop app with:

- **Main Process**: Node.js runtime handling database, agent processes (via node-pty), git operations, and system integration
- **Renderer Process**: React SPA with secure IPC communication via contextBridge
- **Preload Scripts**: Secure bridge between renderer and main process (no nodeIntegration)
- **SQLite Database**: WAL-mode database for sessions, messages, events, metrics, merge queue
- **Agent Processes**: Spawned via node-pty with Claude Code CLI, managed with tree-kill

## License

MIT
