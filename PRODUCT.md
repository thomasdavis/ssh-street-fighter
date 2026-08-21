# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- People who want to play a complete arcade fighting game from an ordinary terminal with no install.
- Spectators following live matches, replays, rankings, fighters, and the technical project on the public website.
- Developers building independent bots against the documented SSH, JSON-lines, and HTTP interfaces.

## Product Purpose

SSH Fighter makes a responsive real-time fighting game playable over SSH. The server owns simulation, matchmaking, rendering, persistence, and replays; the terminal remains a thin display and input device. Success means connecting with one command, immediately understanding the game, and getting a fair, legible fight on a wide range of terminals.

## Positioning

This is not a text adventure decorated like a fighter. It is a deterministic 30 Hz arcade game with original animated pixel fighters and arenas, rendered into truecolor Unicode cells and diff-streamed over an ordinary SSH connection.

## Operating Context

Players enter with `ssh sshfighter.com`, then use terminal input for menus and combat. The companion website explains the roster and technology, exposes live activity and rankings, and provides watchable replays. Bots live in their own repositories and connect through public protocols; this repository contains only the generic example client and protocol documentation.

## Capabilities and Constraints

- Universal terminal rendering uses quadrant, octant, or half-block cells with 24-bit ANSI foreground and background colors.
- Combat and input run at 30 Hz; visual output runs at up to 15 Hz with exact changed-cell diffs, SSH compression, and slow-client backpressure.
- Optional terminal capabilities must degrade silently to the universal rendering and input path.
- Human and bot identities are distinct, with separate Human and Open League views and mutual Quick Match opponent preferences.
- The game engine is authoritative. Website catalogs and technical explanations must be generated from or verified against real engine data and source.
- Public pages require responsive behavior, accessible structure, canonical metadata, Open Graph metadata, and X card metadata.

## Brand Commitments

The product name is SSH Fighter. Its voice is concise, technically honest, playful, and arcade-literate. Preserve the original fighter and arena assets, the terminal-first premise, creator attribution to [@ajaxdavis](https://twitter.com/ajaxdavis) and [ajaxdavis.dev](https://ajaxdavis.dev), and the established near-black, gold, cyan, and red ringside identity.

## Evidence on Hand

- Product and operating documentation in `README.md` and `docs/ARCHITECTURE.md`.
- The authoritative renderer under `src/render/`, combat engine under `src/game/`, and SSH boundary under `src/net/`.
- Packed production assets under `assets/sprites/` and `assets/stages/`.
- Product screenshots under `docs/screenshots/` and the live public site at `sshfighter.com`.

## Product Principles

- Make the terminal feel like a first-class game screen, not a novelty constraint.
- Demonstrate the real mechanism; never replace technical truth with generic marketing language.
- Keep the engine as the single source of truth for combat, replays, bot observations, and published data.
- Prefer graceful compatibility and bounded work over client-specific assumptions.
- Keep entry immediate: no install, no account ceremony, one SSH command.
