// PROXY protocol v1 parsing. When a TCP relay (Fly/haproxy) fronts the origin,
// every connection's source IP is the relay's — so the relay prepends a one-line
// PROXY header carrying the REAL client address, which we parse and strip before
// the SSH stream begins. This keeps region-aware matchmaking + telemetry seeing
// the true client IP even though all traffic arrives via the edge.
//
// v1 header (ASCII, ends in CRLF), e.g.:
//   "PROXY TCP4 203.0.113.7 158.69.195.38 54321 22\r\n"
//   "PROXY TCP6 2001:db8::1 2001:db8::2 54321 22\r\n"
//   "PROXY UNKNOWN\r\n"

const SIG = 'PROXY ';
const MAX = 108; // v1 headers are at most 107 bytes + implied bounds

export interface ProxyInfo { ip: string; port: number; consumed: number; }

/**
 * Parse a PROXY v1 header at the start of `buf`.
 *  - returns {ip,port,consumed} on a complete, valid header (ip='' for UNKNOWN),
 *  - returns 'incomplete' if the CRLF hasn't arrived yet (need more bytes),
 *  - returns null if this clearly isn't a PROXY header (proceed without stripping).
 */
export function parseProxyV1(buf: Buffer): ProxyInfo | 'incomplete' | null {
  if (buf.length < SIG.length) {
    // could still be the start of "PROXY " — only 'incomplete' if it matches so far
    return SIG.startsWith(buf.toString('latin1')) ? 'incomplete' : null;
  }
  if (buf.toString('latin1', 0, SIG.length) !== SIG) return null;
  const nl = buf.indexOf('\r\n');
  if (nl === -1) return buf.length > MAX ? null : 'incomplete';
  const line = buf.toString('latin1', 0, nl);
  const consumed = nl + 2;
  const parts = line.split(' ');
  // parts[0]='PROXY'; [1]=proto; [2]=src; [3]=dst; [4]=sport; [5]=dport
  if (parts[1] === 'UNKNOWN') return { ip: '', port: 0, consumed };
  if ((parts[1] !== 'TCP4' && parts[1] !== 'TCP6') || parts.length < 6) return { ip: '', port: 0, consumed };
  const ip = parts[2] ?? '';
  const port = parseInt(parts[4] ?? '0', 10) || 0;
  return { ip, port, consumed };
}
