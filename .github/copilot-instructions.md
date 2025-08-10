# Copilot Instructions for Web Terminal Project

## Architecture Overview

This project is a web-based terminal built with Next.js that persists terminal sessions across page refreshes. The architecture uses:

- **Frontend**: Next.js 15 with React 19 components that use both App Router (`src/app`) and Pages Router (`src/pages`)
- **Terminal Emulation**: xterm.js for rendering the terminal UI in the browser
- **WebSockets**: Socket.IO for real-time bidirectional communication
- **Native Terminal**: node-pty to spawn actual terminal processes on the server
- **Persistence**: localStorage to save terminal session data between refreshes

## Key Components and Data Flow

1. **Custom Server (`server.js`)**: 
   - Creates a unified Next.js + Socket.IO server
   - Manages terminal sessions via `node-pty`
   - Routes terminal I/O between browser clients and native shell processes
   - Session data is kept in a `Map` with session IDs as keys

2. **Terminal Component (`src/components/Terminal.js`)**:
   - Uses xterm.js to render the terminal in the browser
   - Connects to the Socket.IO server
   - Handles terminal I/O using React hooks and Socket.IO events
   - Saves terminal state to localStorage for persistence

3. **Data Flow**:
   - User Input → Terminal.js → Socket.IO → server.js → node-pty → Shell
   - Shell Output → node-pty → server.js → Socket.IO → Terminal.js → xterm UI
   - Session Persistence: Terminal output is saved to localStorage periodically

## Development Workflow

- **Starting the Dev Server**: `npm run dev` - runs custom `server.js` instead of default Next.js dev server
- **Default Port**: 3001 (configured in `server.js`)
- **Building for Production**: `npm run build` followed by `npm start`

## Critical Patterns and Conventions

- **Terminal Lifecycle**: Terminal initialization in React must respect component lifecycle:
  - Terminal must be created in useEffect to avoid SSR issues
  - Terminal cleanup is critical to prevent memory leaks and socket connection issues
  - See `Terminal.js` for the complete initialization and cleanup pattern

- **Socket.IO Session Management**:
  - Sessions are identified by unique IDs stored in localStorage
  - Sessions are maintained on the server in a `Map` structure with terminal processes
  - Multiple clients can connect to the same session (shared terminal)

- **DOM Manipulation Caution**:
  - xterm.js performs direct DOM manipulation, which can conflict with React's virtual DOM
  - Use refs to provide DOM elements to xterm.js, avoid direct DOM manipulation elsewhere
  - Terminal rendering must happen client-side only (hence the dynamic import with ssr: false)

## Common Gotchas

- The terminal component must be dynamically imported with `{ ssr: false }` to avoid SSR issues
- Changes to server.js require a server restart to take effect
- Terminal resizing requires updating both the frontend terminal and the server-side pty
- Direct DOM manipulation in React components can conflict with xterm.js' own DOM operations

## Project Expansion Points

- Terminal session data is currently stored only in localStorage - implement a database for more persistent storage
- Multiple terminal tabs can be implemented by creating separate terminal instances with unique IDs
- Custom terminal themes can be added by modifying the xterm.js theme configuration in `Terminal.js`
