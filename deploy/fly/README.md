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
