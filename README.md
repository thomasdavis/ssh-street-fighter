<div align="center">

# SSH Fighter

### A real-time arcade fighter streamed through your terminal.

[![CI](https://github.com/thomasdavis/sshfighter.com/actions/workflows/ci.yml/badge.svg)](https://github.com/thomasdavis/sshfighter.com/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-f7d94c.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-28c6e5.svg)](tsconfig.json)
[![Play over SSH](https://img.shields.io/badge/play-ssh%20sshfighter.com-ef4452.svg)](#play-now)

No download. No browser. No account. Just SSH in, choose a fighter, and throw hands.

```console
ssh sshfighter.com
```

[Play now](#play-now) · [Browse fighter guides & sprites](https://sshfighter.com) · [How it works](docs/ARCHITECTURE.md) · [Contribute](CONTRIBUTING.md)

Created by [@ajaxdavis on Twitter](https://twitter.com/ajaxdavis) · [ajaxdavis.dev](https://ajaxdavis.dev)

<img src="docs/screenshots/gameplay.png" alt="BYU fighting MEN beneath the responsive terminal-native HUD" width="100%">

</div>

## Why this is fun

SSH Fighter is a full two-player fighting game rendered with 24-bit ANSI color and Unicode block pixels (octant / quadrant / half, picked for your terminal). The server runs combat, matchmaking, animation, persistence, and rendering; your ordinary terminal is the game client.

- **Seventeen complete fighters**, each with three character-specific special moves
- **Six animated arenas** with rain, surf, mist, steam, petals, runway lights, and other stage-bound motifs
- **Real motion inputs** with a packet-safe input buffer for split SSH escape sequences
- **Best-of-three online fights**, solo practice, direct challenges, and a quick-match queue
- **Persistent ELO ratings**, records, leaderboard, handles, and lounge chat
- **Per-player controls**, configurable in-game and remembered with your SSH identity
- **Zoom-proof adaptive HUD** using crisp terminal glyphs over the renderer-native world
- **Truecolor by default**, compressed and diff-streamed without flattening the palette
- **Live fighter dossiers** with original stories, animated sprites, tactics, inputs, damage, and frame data

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/fighter-select.png" alt="Fighter selection screen"></td>
    <td width="50%"><img src="docs/screenshots/lounge.png" alt="Fight Lounge with persistent chat and direct challenges"></td>
  </tr>
  <tr>
    <td align="center"><strong>Seventeen distinct move sets</strong></td>
    <td align="center"><strong>Chat, presence, and direct challenges</strong></td>
  </tr>
</table>

## Play now

Any terminal with SSH and truecolor support works:

```console
ssh sshfighter.com
```

Your public-key fingerprint becomes your identity. Connect with a key to keep your handle, record, and rating across sessions. Password or keyless connections still work as unrated guests; no real password is checked or stored.

> New to SSH? The command above is all you need on macOS, Linux, Windows Terminal, Termux, or another OpenSSH-compatible client.

### Humans, bots, and independent identities

Human Quick Match defaults to human opponents; press `T` on fighter select to switch between the human-only and bot-only pools. The selection is remembered for verified SSH players. Direct lounge challenges remain explicit and can cross player types.

Bot play is detected automatically when an SSH identity authenticates on the JSON-lines play protocol, and that classification is sticky. Bots and humans use the same ELO calculation, but the public rankings expose a **Human League** (humans only) and an **Open League** (everyone, with bots labeled). Because identity is the SSH public-key fingerprint, reuse of your normal SSH key also reuses your handle, ELO, and match history—and permanently marks that identity as a bot. Give every bot a dedicated key:

```console
ssh-keygen -t ed25519 -f ~/.ssh/sshfighter-mybot -C sshfighter-mybot
ssh -i ~/.ssh/sshfighter-mybot -o IdentitiesOnly=yes MYBOT@<host>
```

During that one interactive connection, choose the bot's handle. Then launch the JSON-lines example with the same key:

```console
node examples/bot.mjs --user MYBOT --host <host> --char BYU --identity ~/.ssh/sshfighter-mybot
```

Bots enter the open opponent pool by default. They can request humans only or bots only with the protocol field `"opponents":"humans"` or `"opponents":"bots"`; the example client exposes the same choice as `--opponents all|humans|bots`.

`--identity` also enables OpenSSH's `IdentitiesOnly=yes`, preventing fallback to a personal key. SSH bot play needs no API token. Mint one with `ssh -i <key> -o IdentitiesOnly=yes MYBOT@<host> token` only when using the REST API or optional direct TCP transport. See [`examples/bot.mjs`](examples/bot.mjs) for the protocol and a small example controller.

Production bots should live in their own repositories and interact with SSH Fighter only through the documented SSH or HTTP APIs. This repository intentionally contains no bot policy, training, evaluation, or deployment code beyond the generic example client and protocol documentation.

The opening `hi` and `welcome` messages, and every `matchStart`, include `engine`, `commit`, `dirty`, and a display-ready `build` such as `sf-6@a3d35dbbbe18`. Bots can also query the same canonical identity without authenticating:

```console
curl https://sshfighter.com/version
```

The same JSON-lines channel can join the live Fight Lounge instead of the quick-match queue. Lounge agents share presence, persistent chat, and direct challenges with terminal players:

```json
{"t":"joinLounge","char":"FABLE"}
{"t":"chat","message":"FABLE agent online — challenge me"}
{"t":"challenge","targetId":"<id from a lounge roster update>"}
{"t":"acceptChallenge"}
```

The server emits `lounge` snapshots containing `roster` and `chat`, plus `notice` and `challengeState` updates. Use `declineChallenge`, `cancelChallenge`, or `leaveLounge` for the corresponding actions. An agent cannot occupy the lounge, quick-match queue, and a fight simultaneously; chat is restricted to 140 printable ASCII characters and one message per 700 ms, matching the terminal client.

## Controls

| Action | Key |
|---|---|
| Walk / crouch / jump | Arrow keys |
| Punch | `W` |
| Kick | `E` |
| Throw | `F` — a close-range **unblockable grab** (beats a turtle; whiffs if not point-blank) |
| Jump (alternate) | Space |
| Block | Hold away from your opponent |
| Character move card | `?` during a fight |
| Exit practice | `Q` (a ranked match can't be quit — win, lose, or disconnect) |
| Menus | `W` / `S`, arrows, Enter |
| Quick Match opponent pool | `T` on fighter select — humans by default, or bots only |

Choose **Controls** on the main menu to rebind every combat direction, both jump slots, punch, kick, and throw. Duplicate bindings are rejected before they can make a move unreachable. Verified SSH players keep their layout across reconnects; guest layouts last for the current session. `Q`, `V`, and `?` remain fixed so exiting practice, changing graphics mode, and opening the move card are always recoverable.

The terminal has no diagonal key events, so specials use compact four-direction motions. Inputs are relative to the direction your fighter is facing.

<details>
<summary><strong>All 51 special moves</strong></summary>

| Fighter | Special moves |
|---|---|
| **BYU** | `→ ↓ → + W` Dragon Punch · `↓ → + W` Hadouken · `↓ ← + E` Hurricane Kick |
| **MEN** | `→ ↓ → + W` Blazing Uppercut · `↓ → + W` Fireball · `↓ ← + E` Tornado Kick |
| **BLANKO** | `← → + W` Rolling Attack · `↓ ↑ + E` Vertical Roll · `↓ ↑ + W` Electric Thunder |
| **CHONG** | `↓ → + W` Kikoken · `↓ → + E` Lightning Legs · `↓ ↑ + E` Spinning Bird Kick |
| **GYLE** | `← → + W` Sonic Boom · `↓ ↑ + E` Flash Kick · `↓ ← + W` Sonic Cyclone |
| **ZANG** | `→ ↓ ← + W` Cyclone Driver · `← → + W` Double Lariat · `↓ ← + E` Flying Press |
| **DHAL** | `↓ → + W` Yoga Fire · `↓ ← + W` Yoga Flame · `↓ → + E` Drill Kick |
| **HONDO** | `← → + W` Sumo Headbutt · `↓ → + W` Hundred Hand · `↓ ↑ + E` Sumo Smash |
| **KIRA** | `→ ↓ → + W` Zero Ascent · `↓ → + W` Phase Needle · `↓ ← + E` Rift Counter |
| **MAKO** | `↓ → + W` Moon Tide · `↓ → + E` Ginga Rush · `↓ ← + E` Axé Wheel |
| **OMEGA** | `↓ → + W` Final Testimony · `← → + E` Null Step · `↓ ← + W` Entropy Well |
| **CODEX** | `↓ ↑ + W` Context Ascent · `← → + E` Branchwalk · `↓ → + E` Weight of Evidence (also during Context descent) |
| **FABLE** | `↓ ↑ + W` Story Arc · `← → + E` Plot Twist · `↓ ← + W` Ink Tempest |
| **MNEME** | `↓ ← + W` Turret · `↓ → + W` Spread Shot · `↓ ↑ + E` Nova Burst |
| **AJAX** | `↓ → + E` Boomerang · `← → + W` Iron Brace · `↓ ← + E` Lasso |
| **XENON** | `← → + E` Phase Dash · `↓ ↑ + W` Reflect · `↓ ← + W` Blink Strike |
| **UNCLOSE** | `↓ → + W` Token Stream · `↓ ← + W` Waveform · `↓ ← + E` Free Tier |

</details>

## The arenas

Dojo · Night Market · Jungle Ruins · Mountain Airbase · Monsoon Palace · Storm Harbor

Each arena is a packed 240×160 RGBA scene with its own bounded procedural motif layer. The motifs animate independently at 7.5 Hz, while combat and input remain at 30 Hz.

## Run your own server

Requirements: Node.js 22+, pnpm 9+, and `ssh-keygen`.

```bash
git clone https://github.com/thomasdavis/sshfighter.com.git
cd sshfighter
pnpm install --frozen-lockfile
pnpm run keygen
pnpm start
```

The server listens on `0.0.0.0:2223` by default. Configuration is entirely environment-based:

| Variable | Default | Purpose |
|---|---:|---|
| `SF_HOST` | `0.0.0.0` | SSH bind address |
| `SF_PORT` | `2223` | SSH port |
| `SF_DB` | `data/streetfighter.db` | SQLite database path |
| `SF_COLOR_STEP` | `1` | Explicit RGB quantization step; `1` is full truecolor |
| `SF_COLOR_MODE` | unset | Set to `256` only for an intentionally indexed-color server |
| `SF_RENDER_WORKERS` | unset | `N` or `auto` runs the heavy fight render on worker threads (uses more cores) |
| `SF_CAPS` | unset | Set to `1` to enable the optional terminal enhancements below |
| `SF_KITTY_W` | `240` | Graphics image width in px (downscaled for bandwidth) when `SF_CAPS=1` |
| `SF_KITTY_HZ` | `6` | Graphics repaint rate for animated screens when `SF_CAPS=1` |
| `SF_WORKERS` | `1` | Cluster worker processes (each serves connections; a primary coordinates matches) |
| `SF_BACKLOG` | `1024` | TCP accept backlog for connection bursts |
| `SF_PROXY_PROTOCOL` | unset | `1` to accept a leading PROXY v1 header (real client IP behind a relay) |
| `SF_BOT_PORT` | `8091` | Loopback port for the JSON-lines bot-play server |
| `SF_PUBLIC_HOST` | `sshfighter.com` | Host shown in bot onboarding messages |
| `SF_COMMIT_SHA` | current Git `HEAD` | Source revision for deployments without a readable `.git` checkout |
| `SF_BUILD_DIRTY` | auto-detected | Optional `true`/`false` override for build cleanliness |
| `SF_DISCORD_WEBHOOK` | unset | Optional best-effort Discord destination for vital community events only |

All events are recorded locally in the append-only `analytics_events` SQLite table for the planned analytics site. Discord receives only quick-match waiting, match start/result, forfeit, and lounge chat events. Inputs, special moves, screen views, connections, and terminal resolution changes never go to Discord. See [the analytics contract](docs/ANALYTICS.md).

Copy [`.env.example`](.env.example) as a starting point. Never commit a webhook, host key, database, or gallery admin token.

### Optional terminal enhancements

For modern terminals (Ghostty, Kitty, WezTerm, VS Code, and others), `SF_CAPS=1` turns on an experimental capability layer, negotiated per connection so anything unsupported degrades silently:

- **Kitty graphics** — the whole scene as a true-colour image instead of block glyphs. Heavier over SSH, so it stays opt-in per player: press `V` to cycle `quadrant → octant → graphics`. Tune bandwidth with `SF_KITTY_W` / `SF_KITTY_HZ`.
- **Precise fight input** — the kitty keyboard protocol gives real key press/release, so holds/blocks/charges land exactly (instead of an auto-repeat expiry window).
- **Mouse** — click a portrait on the select screen, wheel-scroll the lounge chat.
- **No tearing** — synchronized output (mode 2026) paints each frame atomically.

It is **off by default**; the standard experience is the universal octant renderer with the legacy input parser.

### Fighter dossiers and sprite gallery

The optional Next.js site renders every packed pose as a PNG and publishes one responsive guide at `/fighters/<name>` for every roster entry. Profiles include original background stories, animated move sequences, tactics, inputs, damage, chip, range, and frame timing. A prebuild exporter reads the real roster, move, and engine modules before every web build, so the site cannot drift into a second hand-maintained combat database.

```bash
cd web
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

It runs on port `3130`. Regeneration controls stay disabled unless the server receives both `SF_GALLERY_ADMIN_TOKEN` and `OPENAI_API_KEY`.

## Performance model

The renderer preserves color and detail while limiting transport work:

- simulation and input at **30 Hz**; rendering at **15 Hz**, adaptively lower only for exceptionally large terminals
- changed-cell ANSI diffs instead of full-frame redraws
- SSH zlib compression, slow-client backpressure, and obsolete-frame coalescing
- bounded sprite and stage caches
- a `900×360` terminal safety cap
- native truecolor (`38;2` / `48;2`) unless the operator explicitly opts into indexed mode

See [the architecture guide](docs/ARCHITECTURE.md) for the render and session pipelines.

## Development

```bash
pnpm typecheck
pnpm test                 # combat, assets, persistence, ANSI reconstruction
pnpm test:e2e             # lounge, challenge, matchmaking, and practice over real SSH
pnpm exec tsx src/dump-png.ts fight 112 36
```

The canonical engine compatibility family lives in `src/version.ts`. Bump `ENGINE_VERSION` whenever combat changes would alter deterministic replay results or the meaning of bot observations; the exact Git revision distinguishes deployments within that family.

The asset contract verifies all seventeen complete dossiers, all 51 explained special-move definitions, every required fighter pose, and all six stage payloads. CI also rebuilds the authoritative fighter catalog and the Next.js site.

## Project map

```text
src/
  game/       deterministic 30 Hz combat, moves, roster, stages, sprites
  render/     RGB pixel grids, octant/kitty render backends, exact ANSI diffs
  screens/    menu, select, lounge, fight HUD, help, results, leaderboard
  net/        SSH authentication, sessions, the Terminal I/O boundary, matchmaking, challenges
  input/      key bindings + the fight input parser (legacy + optional kitty keyboard)
  cluster/    optional multi-worker match coordinator
  db/         additive SQLite schema, players, controls, ELO, match/chat/event history
  telemetry/  local analytics plus vital-only non-blocking Discord delivery
assets/
  sprites/    packed RGBA pose JSON files plus one generation anchor per fighter
  stages/     six packed arena backgrounds
web/          Next.js fighter dossiers, animated sprite gallery, and guarded regeneration UI
```

## Contributing

Bug fixes, renderer work, accessibility improvements, terminal compatibility reports, fighter balance, sprites, and new arenas are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and please follow the [community guidelines](CODE_OF_CONDUCT.md).

The public [roadmap](ROADMAP.md) tracks privacy-safe aggregate analytics, additional fighters, and other contribution-sized milestones.

## License and naming

SSH Fighter is created and maintained by [Thomas Davis (@ajaxdavis)](https://twitter.com/ajaxdavis). More projects are at [ajaxdavis.dev](https://ajaxdavis.dev).

Code and original project assets are released under the [MIT License](LICENSE). This is an independent fan-made technical experiment, not affiliated with or endorsed by Capcom. “Street Fighter” and related marks belong to their respective owners; the game uses an original parody roster and original generated artwork.
