# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow semantic versioning.

## [1.0.0] - 2026-08-20

First tagged release. SSH Fighter is a complete two-player fighting game
you play by SSH-ing into a terminal — no download, no browser, no account.

### Highlights

- **17 fighters**, each with three data-defined special moves (**51** total) and full pose coverage; **six** animated arenas.
- Quick matchmaking, solo practice, a **Fight Lounge** (presence + persistent chat + direct challenges), and best-of-three online fights.
- Verified SSH-key identities with persistent handles, ELO, records, main fighters, and fully rebindable combat controls.
- Universal **octant/quadrant renderer** with changed-cell ANSI diffs, zlib transport, slow-client backpressure, and a zoom-proof pixel-font HUD.
- Read-only public **fighter dossiers + sprite gallery** generated from the authoritative game definitions.
- Append-only local analytics with a vital-only Discord allowlist.
- Optional multi-worker cluster (`SF_WORKERS`) with a cross-worker match coordinator and client-side prediction.

### Recent work rolled into 1.0.0

- **Redesigned character-select** — a Street-Fighter-II-style grid of framed face portraits with the highlighted fighter posing on a spotlit stage.
- **Rebuilt Fight Lounge** — responsive two-panel layout (the players box no longer disappears at different zooms), word-wrapped chat, and arrow-key / wheel scrollback.
- **New abstractions** — a `Terminal` I/O boundary and a `Renderer` backend seam extracted from the session.
- **Optional terminal enhancements** (`SF_CAPS=1`, **off by default**) — kitty graphics, precise kitty-keyboard fight input, SGR mouse, and synchronized output; negotiated per connection and degrading silently.
- **Provenance fix** — the simulator training exporter reports the canonical engine version instead of a stale hard-coded label, with a documented version-bump policy.

[1.0.0]: https://github.com/thomasdavis/sshfighter.com/releases/tag/v1.0.0
