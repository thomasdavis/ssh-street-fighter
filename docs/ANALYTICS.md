# Analytics and event policy

The game records a durable, append-only event stream in SQLite so public analytics can be built from real play instead of invented counters. Discord is a community notification channel, not a log drain. Static fighter dossiers already ship from authoritative game definitions; observed play analytics remain the next layer.

## Delivery policy

| Event family | Local `analytics_events` | Discord |
|---|---:|---:|
| Quick-match player waiting | Yes | Yes |
| Match started, won, or forfeited | Yes | Yes |
| Lounge chat message | Yes | Yes |
| Challenge state | Yes | No |
| Special-move usage | Yes | No |
| Screen and control changes | Yes | No |
| SSH connection and authentication | Yes | No |
| Terminal open, resize, and renderer changes | Yes | No |
| Service lifecycle | Yes | No |

The code-level Discord allowlist lives in `src/telemetry/discord.ts` and has regression coverage. Adding an event at a call site never sends it externally by default.

## Storage contract

`analytics_events` contains a normalized event name, JSON fields, and a millisecond timestamp. It is intentionally append-only. Game state tables remain authoritative for current player ratings and match results; the event ledger explains how the product is used over time.

Fields may include private operational metadata such as an IP address or connection ID. Those values are useful for security and reliability work but are not public profile data.

## Public website

The website has two source-of-truth layers:

- **Character and move profiles (shipped):** roster metadata, original lore, animation contracts, damage, chip, startup, active, recovery, range, and move inputs exported directly from the game before each web build.
- **Observed play analytics (planned):** aggregate pick rate, move usage, matchup outcomes, ELO distribution, and activity windows computed from matches and the event ledger.

Public endpoints must aggregate counts, enforce a minimum cohort where appropriate, and omit IP addresses, connection IDs, raw actor references, chat text, and raw event rows. Character balance numbers must be imported from engine definitions rather than copied into a second table that can drift.
