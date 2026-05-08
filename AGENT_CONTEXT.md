# Last Escape Agent Context

Use this file as a quick map of the codebase before making small changes.

## Stack
- Client: React + Vite + Socket.IO client (`client/`)
- Server: Express + Socket.IO (`server/`)
- Real-time game state is authoritative on the server.

## Project Layout
- `server/index.js`: Main game server, room lifecycle, team logic, combat, key/zone rules, game loop.
- `server/maze.js`: Base maze + side-exit fairness cover injection, map constants.
- `client/src/App.jsx`: Lobby flow (create/join room, mode selection, room list/start).
- `client/src/Game.jsx`: Rendering, controls, HUD, kill feed, spectate, in-match UI.
- `client/src/socket.js`: Socket endpoint resolution and client socket setup.
- `client/src/constants.js`: Client fallback map constants (server state is primary during matches).

## Game Modes
- `ffa`: up to 8 players.
- `2v2`: exactly 4 players, team mode.
- `4v4`: exactly 8 players, team mode.

Server mode behavior:
- Team auto-assignment to `A`/`B`.
- Friendly fire disabled in team mode (dash + bullets).
- Key-drain damages enemies only in team mode.
- Team win when key carrier exits in team mode.

## Key Socket Events
- Client -> Server:
  - `join-room` `{ roomId, playerName, create, mode? }`
  - `start-game`
  - `player-move`, `player-shoot`, `player-dash`, `play-sound`
- Server -> Client:
  - `room-update`
  - `game-started`
  - `game-state`
  - `game-over`
  - `player-knockback`
  - `play-sound`
  - `error`

## Spectate Logic Notes
- In team mode, spectate candidate priority is alive teammates, then alive enemies.
- Spectate UI supports switching targets (prev/next).
- Camera follows selected target while spectating.

## Map Fairness Notes
- Mid exits (top/bottom/left/right) receive symmetric cover tiles at runtime in `server/maze.js`.
- Keep future map edits symmetric where possible to avoid directional advantage.

## Local Validation Commands
- Server syntax check:
  - `node --check index.js` (run in `server/`)
- Client lint:
  - `npm.cmd run lint` (run in `client/`)
- Client build:
  - `npm.cmd run build` (run in `client/`)

## Common Quick-Edit Targets
- Change lobby UX/modes: `client/src/App.jsx`, `client/src/App.css`
- Change in-match UI/spectate: `client/src/Game.jsx`, `client/src/App.css`
- Change game rules/balance: `server/index.js`
- Change map/covers/exits: `server/maze.js`
