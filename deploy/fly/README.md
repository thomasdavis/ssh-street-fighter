# Fly.io TCP accelerator for sshfighter

Puts Fly's global Anycast + private backbone in front of the OVH Canada origin,
without moving the game. A player lands on the nearest Fly edge; Fly backhauls
the raw TCP to a relay Machine in Toronto (`yyz`), which forwards it to the OVH
game port. SSH stays end-to-end — Fly forwards bytes, never terminates SSH and
never sees game state. Wins: lower jitter/packet-loss on long routes, some RTT
improvement, DDoS buffer, and origin hiding.

## One-time setup (run from this directory)

```bash
cd deploy/fly
fly auth login                       # opens a URL to authorize in your browser
fly launch --no-deploy --copy-config --name <your-relay-app> --region yyz
fly secrets set ORIGIN_HOST=158.69.195.38 ORIGIN_PORT=22   # the OVH game port
fly ips allocate-v4                  # dedicated Anycast IPv4 (~$2/mo)
fly ips allocate-v6
fly deploy
```

Then point DNS (Cloudflare, **grey / DNS-only** — a proxy would break raw SSH):

```
play.sshfighter.com  A     <fly-anycast-ipv4>
play.sshfighter.com  AAAA  <fly-anycast-ipv6>
```

Now `ssh play.sshfighter.com` flows player → nearest Fly edge → Toronto → OVH.
The direct `ssh sshfighter.com` still works too — keep both while you measure.

## Measure before committing (the number that matters is jitter)

From machines in AU / EU / US, compare **direct vs relayed** — latency *and*
loss/jitter over a few minutes, not a single ping:

```bash
mtr -T -P 22 -c 300 sshfighter.com          # direct to OVH
mtr -T -P 22 -c 300 play.sshfighter.com     # via Fly
```

Our netcode already makes your own input zero-latency (client-side prediction),
so the relay's job is smoothing the opponent's motion — judge it on the jitter /
loss delta, not headline RTT.

## Cutover / hardening (only after the relay proves itself)

Lock the game port to Fly so players can't hit the origin directly and the
origin IP stops mattering:

```bash
# allocate a static egress IP for the relay Machine, then on OVH:
sudo ufw allow from <FLY_EGRESS_IP> to any port 22 proto tcp
sudo ufw delete allow 22/tcp
# admin SSH stays on :2222, untouched
```

Note: once the origin only sees Fly's IP, region-aware matchmaking loses the real
client IP. Recover it with the PROXY protocol (haproxy `send-proxy` on the
backend + parse it on the origin) — a small follow-up when you cut over.

## Origin lockdown (applied)

The OVH origin's game port is firewalled to Fly's **static egress IPs** only, so
the origin can't be reached directly from the internet — all player traffic must
go through the anycast edge.

Fly static egress IPs (allocated per relay machine, `fly machine egress-ip list`):
- `209.71.99.130`  (machine 86321ea15d6508)
- `209.71.99.50`   (machine 850d59a0531038)

ufw on the origin:
```bash
sudo ufw allow from 209.71.99.130 to any port 22 proto tcp comment 'fly relay egress'
sudo ufw allow from 209.71.99.50  to any port 22 proto tcp comment 'fly relay egress'
sudo ufw delete allow 22/tcp        # remove the world-open rule (v4 + v6)
# admin :2222 stays open (world) as the safety net
```

Verified from an external host: direct `origin:22` → BLOCKED; `anycast:22` → OK.

**Operational caveat:** static egress IPs survive a machine *restart* but are tied
to the machine — if a relay machine is **destroyed and recreated** (e.g. some
deploys), it gets a NEW egress IP and you must re-allow it (and drop the old one),
or players via that machine are blocked. After a deploy, check
`fly machine egress-ip list --app sshfighter-relay` and reconcile the ufw rules.
Admin `:2222` is unaffected, so you can always get in to fix it.
