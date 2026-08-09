# Architecture

SSH Street Fighter treats the terminal as a thin display and input device. One Node.js process owns SSH transport, sessions, matchmaking, simulation, and frame production.

```text
OpenSSH client
   │ keys + terminal resize + input bytes
   ▼
ssh2 server ──► Session ──► screen / Arena / SocialHub
                   │                  │
                   │                  ├── SQLite: identity, controls, ELO,
                   │                  │           matches, chat, all events
                   │                  └── vital-only Discord event queue
                   ▼
             30 Hz combat engine
                   │ shared Match state
                   ▼
          stage + sprites + motifs
                   │ + adaptive text-cell HUD
                   ▼
      RGB PixelGrid → terminal cells → ANSI diff
                   │ zlib + backpressure
                   ▼
              OpenSSH client
```

## Rendering

The scene is composed into an RGB pixel grid. A terminal cell represents a pair of vertical color regions in half-block mode, giving two addressable pixels per cell with independent foreground and background colors. The renderer then compares the new terminal-cell array with the previous frame and emits cursor moves plus only the SGR channels that changed.

The fight world uses the pixel renderer while critical HUD information—fighter names, numeric health, health bars, wins, round, timer, announcements, and controls—uses a text-cell overlay with the same color model. The HUD recomposes at content-driven terminal-width tiers, keeping every critical label at one real terminal glyph per character even when font zoom leaves only a 24×12 grid.

The server preserves 24-bit values by default. `SF_COLOR_STEP` and `SF_COLOR_MODE=256` exist only as explicit compatibility controls.

## Timing and backpressure

- Input parsing and deterministic combat advance at 30 Hz.
- Visual output is capped at 15 Hz, then reduced for very large terminal areas.
- Stage motifs animate at 7.5 Hz.
- Scene and sprite scaling use bounded caches.
- A failed stream write marks the session output-blocked. Intermediate obsolete frames are discarded until `drain`, preventing slow clients from accumulating an unbounded animation history.
- Terminal dimensions are capped at 300×120 for render work. The client may request a larger PTY, but the game never allocates beyond that safety boundary.

## Combat and moves

Combat is deterministic shared state. For a versus match, one session advances a `Match`; both sessions render the same object and contribute separate input snapshots. A motion buffer converts packet-safe direction histories into relative direction codes. Move ownership and presentation live in `game/moves.ts`, which keeps special attacks data-driven.

The Next.js site does not maintain a parallel balance database. Its `prebuild` runs `src/tools/export-fighter-catalog.ts`, which imports the real roster, moves, animation-frame contracts, and combat-stat function and writes a generated web snapshot. Profile routes add current sprite dimensions and mtime-versioned PNG URLs at request time. This keeps the website independently buildable while making game definitions authoritative.

## Identity and ratings

Public-key authentication verifies the supplied signature, then hashes the key into a stable fingerprint used by SQLite. Password or keyboard-interactive connections are deliberately treated as anonymous guests. Only matches between two distinct verified identities change ELO, preventing rating farming with disposable guests.

Schema upgrades are additive at startup. The game never needs a separate migration command for existing installations.

Each verified player can persist a JSON key map on the same public-key identity row. The map is schema-checked at load, requires unique bindings, and falls back atomically to the safe defaults if stored data is malformed. Guests use the same control system in memory without creating a durable identity.

## Social layer

The in-process `SocialHub` owns lounge presence and direct challenge state. Chat history is durable in SQLite; presence and pending challenges are intentionally ephemeral. Challenges can be accepted, declined, or cancelled; acceptance removes both players from the lounge and pairs them directly through the same `Arena` path used by matchmaking.

## Analytics and Discord

Every instrumented event passes through one telemetry boundary and is appended to `analytics_events` before any external delivery decision. A small explicit allowlist permits only quick-match waiting, match start/result, forfeit, and chat events to reach an optional Discord webhook. Noisy operational events—special moves, renderer and resolution changes, connections, screen views, and control edits—remain local for aggregate analytics. Discord failure never blocks the game loop.

The future public analytics API must aggregate or redact local fields rather than expose raw event rows. The full event/privacy contract is documented in [ANALYTICS.md](ANALYTICS.md).
