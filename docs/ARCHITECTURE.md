# Architecture

SSH Fighter treats the terminal as a thin display and input device. A Node.js process owns SSH transport, sessions, matchmaking, simulation, and frame production. It runs single-process by default; `SF_WORKERS>1` forks a cluster where each worker serves connections and a primary coordinates cross-worker matches (`cluster/coordinator.ts`), with client-side prediction hiding the round trip.

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

## The terminal boundary

A `Terminal` (`net/terminal.ts`) owns everything about talking to the client: the SSH duplex stream, backpressure-aware writing, optional capability negotiation, the idle keepalive, and the render backends. The `Session` holds one `Terminal`, composes a `Frame`, and hands it over to paint — it never touches the stream directly. Input flows the other way: the `Terminal` strips any terminal replies/events and passes real keystrokes back to the `Session`.

## Rendering

Every screen — menus and the fight alike — is composed into one RGB pixel grid plus a constant-size pixel font drawn into that same grid (the HUD's health bars, names, timer, and labels are pixel-font, sized so they stay legible at any font zoom). A `Renderer` (`render/renderer.ts`) then turns the grid into bytes:

- **`OctantRenderer`** (default) samples each 2×4 / 2×2 / 1×2 block of pixels into one terminal cell using Unicode block glyphs (`octant` / `quadrant` / `half`; `quadrant` is the universal default that renders without drift on any terminal). It double-buffers the resulting cell array and emits a minimal changed-cell ANSI diff — a cursor move plus only the SGR channels that changed.
- **`KittyRenderer`** (optional, `SF_CAPS=1`) sends the whole grid as one zlib-compressed true-colour image via the kitty graphics protocol, for terminals that support it. It is opt-in per player (`V`) and used only on the mostly-static menus, never the fight.

The server preserves 24-bit values by default. `SF_COLOR_STEP` and `SF_COLOR_MODE=256` exist only as explicit compatibility controls. An optional pool of render worker threads (`SF_RENDER_WORKERS`) runs the CPU-heavy fight render off the main thread; everything else stays single-process.

## Optional terminal capabilities

With `SF_CAPS=1`, the `Terminal` probes the client on connect (kitty graphics? kitty keyboard? pixel size?) and enables mouse, focus, in-band-resize, and synchronized-output (mode 2026) reporting. Every reply is stripped from the input stream by `net/caps.ts` before the game sees it, and anything unsupported degrades silently. Off by default, the game is byte-for-byte the universal octant experience.

## Timing and backpressure

- Input parsing and deterministic combat advance at 30 Hz.
- Visual output is capped at 15 Hz, then reduced for very large terminal areas.
- Stage motifs animate at 7.5 Hz.
- Scene and sprite scaling use bounded caches.
- A failed stream write marks the session output-blocked. Intermediate obsolete frames are discarded until `drain`, preventing slow clients from accumulating an unbounded animation history.
- Terminal dimensions are capped at 900×360 for render work. The client may request a larger PTY, but the game never allocates beyond that safety boundary.

## Combat and moves

Combat is deterministic shared state. For a versus match, one session advances a `Match`; both sessions render the same object and contribute separate input snapshots. A motion buffer converts packet-safe direction histories into relative direction codes. Move ownership and presentation live in `game/moves.ts`, which keeps special attacks data-driven.

The Next.js site does not maintain a parallel balance database. Its `prebuild` runs `src/tools/export-fighter-catalog.ts`, which imports the real roster, moves, animation-frame contracts, and combat-stat function and writes a generated web snapshot. Profile routes add current sprite dimensions and mtime-versioned PNG URLs at request time. This keeps the website independently buildable while making game definitions authoritative.

## Identity and ratings

Public-key authentication verifies the supplied signature, then hashes the key into a stable fingerprint used by SQLite. Password or keyboard-interactive connections are deliberately treated as anonymous guests. Only matches between two distinct verified identities change ELO, preventing rating farming with disposable guests.

Authenticating through the JSON-lines bot protocol permanently classifies that SSH identity as a bot. The marker is copied onto each rich match record so historical pages do not change if a player row is later renamed or removed; the additive migration also backfills identities that already own bot API keys. Dedicated keys are therefore part of the identity contract, not merely an operational suggestion.

Quick Match uses mutual opponent preferences. A terminal player defaults to `humans` and can persistently switch to `bots`; a bot defaults to `all` and may explicitly request `all`, `humans`, or `bots`. A pair forms only when both sides accept the other player type. Same-region selection is preferred, and the aged cross-region fallback uses the same compatibility predicate, so waiting longer never overrides an opt-out. Direct lounge challenges are deliberate pairings and are not restricted by Quick Match preferences.

There is one ELO value per identity and one rating update rule. The **Human League** is a humans-only ranking of that shared rating, while the **Open League** ranks all eligible players and labels bots. This keeps match results canonical while preventing automated accounts from crowding the default human standings.

Schema upgrades are additive at startup. The game never needs a separate migration command for existing installations.

Each verified player can persist a JSON key map on the same public-key identity row. The map is schema-checked at load, requires unique bindings, and falls back atomically to the safe defaults if stored data is malformed. Guests use the same control system in memory without creating a durable identity.

## Social layer

The in-process `SocialHub` owns lounge presence and direct challenge state. Chat history is durable in SQLite; presence and pending challenges are intentionally ephemeral. Challenges can be accepted, declined, or cancelled; acceptance removes both players from the lounge and pairs them directly through the same `Arena` path used by matchmaking.

## Analytics and Discord

Every instrumented event passes through one telemetry boundary and is appended to `analytics_events` before any external delivery decision. A small explicit allowlist permits only quick-match waiting, match start/result, forfeit, and chat events to reach an optional Discord webhook. Noisy operational events—special moves, renderer and resolution changes, connections, screen views, and control edits—remain local for aggregate analytics. Discord failure never blocks the game loop.

The future public analytics API must aggregate or redact local fields rather than expose raw event rows. The full event/privacy contract is documented in [ANALYTICS.md](ANALYTICS.md).
