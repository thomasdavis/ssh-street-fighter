import type { Match } from '../game/types.js';
// Match -> telemetry id. Its own module so both session.ts and the hubs can use
// it without an import cycle.
export const MATCH_IDS = new WeakMap<Match, string>();
