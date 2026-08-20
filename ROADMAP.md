# Roadmap

SSH Fighter is a live game and an open invitation to make terminal multiplayer feel surprisingly complete.

## Shipped

- Seventeen fighters, 51 data-defined special moves, 596 packed poses, and six animated arenas
- Quick matchmaking, practice, lounge chat, direct challenges, and best-of-three fights
- Verified SSH identities with persistent handles, ELO, records, main fighters, and configurable combat controls
- Responsive terminal-native fight HUD, truecolor rendering, zlib transport, and backpressure
- Append-only local analytics with vital-only Discord notifications
- Public MIT repository, contribution/security guidance, Discussions, Issues, and CI with real SSH acceptance tests
- Read-only public fighter dossiers generated from authoritative game definitions, with original lore, animated sprites, tactics, inputs, damage, chip, range, and frame timing

## Next: aggregate analytics

- Aggregated pick rate, move usage, matchup outcomes, ELO distribution, and activity trends
- Privacy boundary that never publishes raw connections, IP addresses, chat text, or event rows

See [docs/ANALYTICS.md](docs/ANALYTICS.md) for the data contract.

## More fighters

New fighters should bring a distinct silhouette, coherent palette, three data-defined specials, complete common/special pose coverage, help text, balance tests, and gallery renders. The contribution path is documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## Good collaboration areas

- Terminal and SSH-client compatibility
- Accessible/custom control layouts
- Fighter balance and deterministic combat tests
- Original sprite animation and stage art
- Aggregate analytics queries and privacy-safe profile UI
- Bandwidth, renderer, and latency profiling
