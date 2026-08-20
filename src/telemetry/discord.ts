import { createHash, randomUUID } from 'crypto';

export type TelemetryValue = string | number | boolean | null | undefined;
export type TelemetryFields = Record<string, TelemetryValue>;

interface EventItem {
  event: string;
  fields: TelemetryFields;
  at: string;
  attempts: number;
}

type AnalyticsSink = (event: string, fields: TelemetryFields, at: string) => void;

/** Human-actionable community events. Everything else remains local analytics only. */
export const DISCORD_EVENTS = new Set([
  'quick_match_queued',
  'match_started',
  'match_won',
  'match_forfeit',
  'chat_message',
]);

// Character picks are competitive information: announcing them before or
// during a match lets the community scout an opponent. Pick-bearing fields are
// stripped at this boundary from every outgoing embed; the local analytics
// sink still records every field.
const PICK_FIELD = /(^|_)(fighter|char|dummy|move|attack)(_|$)/;

function communityFields(fields: TelemetryFields): TelemetryFields {
  const shared: TelemetryFields = {};
  for (const [name, value] of Object.entries(fields)) {
    if (!PICK_FIELD.test(name)) shared[name] = value;
  }
  return shared;
}

const MAX_QUEUE = 200;
const SEND_GAP_MS = 450;
const RETRIES = 2;
const queue: EventItem[] = [];
let pumping = false;
let dropped = 0;
let idleWaiters: Array<() => void> = [];
let analyticsSink: AnalyticsSink | null = null;

function webhook(): string | null {
  const raw = process.env.SF_DISCORD_WEBHOOK?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const localAllowed = process.env.SF_TELEMETRY_ALLOW_HTTP === '1';
    const discordHost = url.hostname === 'discord.com' || url.hostname.endsWith('.discord.com') || url.hostname === 'discordapp.com';
    if ((url.protocol !== 'https:' || !discordHost) && !localAllowed) return null;
    return url.toString();
  } catch { return null; }
}

function clean(value: TelemetryValue, max = 1000): string {
  const text = value === null || value === undefined ? '—' : String(value);
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, max) || '—';
}

function colorFor(event: string): number {
  if (event.includes('match_won') || event.includes('accepted') || event.includes('started')) return 0x3fdf8b;
  if (event.includes('failed') || event.includes('rejected') || event.includes('forfeit') || event.includes('disconnect')) return 0xef4452;
  if (event.includes('challenge') || event.includes('queue') || event.includes('match')) return 0xf7d94c;
  if (event.includes('chat') || event.includes('lounge')) return 0x28c6e5;
  return 0x9b7bff;
}

function bodyFor(item: EventItem): string {
  const fields = Object.entries(item.fields)
    .filter(([, value]) => value !== undefined)
    .slice(0, 24)
    .map(([name, value]) => ({ name: clean(name, 256), value: clean(value, 1024), inline: true }));
  if (dropped > 0) {
    fields.push({ name: 'queue pressure', value: `${dropped} older event${dropped === 1 ? '' : 's'} dropped`, inline: false });
    dropped = 0;
  }
  return JSON.stringify({
    username: 'SSH Fighter',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: clean(item.event.replaceAll('_', ' ').toUpperCase(), 256),
      color: colorFor(item.event),
      fields,
      timestamp: item.at,
      footer: { text: 'sshfighter.com' },
    }],
  });
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function deliver(item: EventItem): Promise<boolean> {
  const target = webhook();
  if (!target) return true;
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'sshfighter/1.0' },
      body: bodyFor(item),
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) return true;
    if (response.status === 429 || response.status >= 500) return false;
    console.warn(`[telemetry] Discord rejected an event with HTTP ${response.status}`);
    return true;
  } catch {
    return false;
  }
}

function notifyIdle(): void {
  if (pumping || queue.length) return;
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const item = queue.shift()!;
    const delivered = await deliver(item);
    if (!delivered && item.attempts < RETRIES) {
      item.attempts++;
      queue.unshift(item);
      await delay(500 * item.attempts);
    } else if (!delivered) {
      console.warn(`[telemetry] Discord event delivery failed after ${RETRIES + 1} attempts`);
    }
    if (queue.length) await delay(SEND_GAP_MS);
  }
  pumping = false;
  notifyIdle();
}

/** Enqueue an event without awaiting network I/O in the game loop. */
export function track(event: string, fields: TelemetryFields = {}): void {
  const normalized = clean(event, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  const at = new Date().toISOString();
  try { analyticsSink?.(normalized, fields, at); }
  catch (error) { console.warn('[analytics] failed to record an event', error); }
  if (!DISCORD_EVENTS.has(normalized) || !webhook()) return;
  if (queue.length >= MAX_QUEUE) { queue.shift(); dropped++; }
  queue.push({ event: normalized, fields: communityFields(fields), at, attempts: 0 });
  void pump();
}

/** Install the local append-only event sink after database initialization. */
export function setAnalyticsSink(sink: AnalyticsSink | null): void {
  analyticsSink = sink;
}

/** A short irreversible identity reference; raw SSH fingerprints never leave the process. */
export function actorRef(fingerprint: string | null, fallback: string): string {
  if (!fingerprint) return `guest:${fallback}`;
  return `key:${createHash('sha256').update(fingerprint).digest('hex').slice(0, 12)}`;
}

export function eventId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Used only for graceful shutdown and tests; ordinary event calls remain fire-and-forget. */
export async function flushTelemetry(timeoutMs = 2500): Promise<boolean> {
  if (!pumping && !queue.length) return true;
  return await Promise.race([
    new Promise<boolean>((resolve) => idleWaiters.push(() => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
}
