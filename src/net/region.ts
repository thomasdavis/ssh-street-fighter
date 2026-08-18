// Coarse continent bucket for a player's IP, used to prefer pairing players who
// are geographically close (lower mutual latency) in matchmaking. Offline lookup
// (geoip-lite, bundled country DB) — no external calls.
//
// NOTE: this reads the SSH source IP, which is the real client while players
// connect directly to the origin. Once a TCP relay (Fly/Gcore) fronts the game,
// the source IP becomes the relay's, so the region would need to arrive via the
// PROXY protocol (or the edge region) instead — a small follow-up at cutover.
import geoip from 'geoip-lite';

const CONT: Record<string, string> = {};
const add = (c: string, codes: string): void => { for (const cc of codes.split(/\s+/)) if (cc) CONT[cc] = c; };
add('NA', 'US CA MX GT CU DO HT HN NI CR PA SV BZ JM BS BB TT PR');
add('SA', 'BR AR CO CL PE VE EC BO PY UY GY SR GF');
add('EU', 'GB IE FR DE ES IT NL BE LU CH AT PT SE NO FI DK IS PL CZ SK HU RO BG GR HR RS SI LT LV EE UA BY MD RU TR CY MT AL MK BA ME');
add('AS', 'CN JP KR TW HK MO IN SG MY TH VN PH ID PK BD LK NP MM KH LA MN KZ UZ IL SA AE QA KW BH OM JO LB IQ IR');
add('OC', 'AU NZ FJ PG NC PF WS TO VU SB');
add('AF', 'ZA NG EG KE MA GH ET DZ TN AO CI CM SN UG TZ ZM ZW MU RW');

/** Continent code (NA/SA/EU/AS/OC/AF) or 'XX' when unknown (pairs with anyone). */
export function regionOf(ip: string): string {
  try { const c = geoip.lookup(ip)?.country; return (c && CONT[c]) || 'XX'; } catch { return 'XX'; }
}
