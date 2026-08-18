declare module 'geoip-lite' {
  export interface GeoLookup { country: string; region: string; ll: [number, number]; timezone?: string; city?: string; }
  export function lookup(ip: string): GeoLookup | null;
  const _default: { lookup: typeof lookup };
  export default _default;
}
