# Deploying sshfighter.com to a dedicated box

This kit stands the game up on a fresh Ubuntu VPS and gives it **port 22**, so
players connect with just `ssh sshfighter.com`.

## What you provide
- An Ubuntu 22.04 or 24.04 VPS (the game is CPU-bound; 4 vCPU / 8 GB is a good
  launch size, resize later).
- The domain `sshfighter.com`, with an A record you can edit.
- SSH access to the box as a sudo-capable user (not root login).

## One-time setup

```bash
# On the new box, as your admin user:
git clone https://github.com/thomasdavis/ssh-street-fighter.git
cd ssh-street-fighter
sudo deploy/bootstrap.sh          # installs everything; adds admin SSH on :2222; does NOT touch :22 yet
```

Then, **before** handing port 22 to the game, prove you won't be locked out:

```bash
# From your laptop, in a SECOND terminal — keep your current session open:
ssh -p 2222 <you>@<box-ip>        # must succeed
```

Only once that works:

```bash
sudo deploy/cutover-port-22.sh    # frees :22 from admin sshd, starts the game on :22
```

Now:
- Players: `ssh sshfighter.com`
- You (admin): `ssh -p 2222 <you>@sshfighter.com`

## DNS
Add an A record: `sshfighter.com -> <box-ip>`, **DNS-only (grey / not proxied)** —
a proxy would break raw SSH. `ssh sshfighter.com` then reaches the game directly.

## Optional web homepage
```bash
sudo deploy/setup-web.sh          # builds the Next.js gallery, serves it via Caddy at https://sshfighter.com
```
(Web needs the A record; if you keep it DNS-only, HTTPS still works via Caddy's
Let's Encrypt over HTTP-01.)

## Day-to-day (develop + release on the box)
```bash
cd ~/ssh-street-fighter
git pull
pnpm install                      # if deps changed
sudo systemctl restart sshfighter        # game
sudo systemctl restart sshfighter-web    # web (if running)
journalctl -u sshfighter -f              # logs
```

## Config
`/etc/sshfighter.env` — `SF_PORT` (22), `SF_HOST`, `SF_DB` (SQLite path under
`data/`), optional `OPENAI_API_KEY` (only to regenerate sprites on the box) and
`SF_DISCORD_WEBHOOK`. The SSH host key is auto-generated at `keys/host.key` on
first start.

### Scaling (cluster)
For high concurrency, run a **cluster** so SSH handshakes, simulation and
rendering spread across every core:
- `SF_WORKERS=N` — N worker processes (a good default is `cores - 2`). The
  primary round-robins connections to workers. `1`/unset = single process.
- `SF_RENDER_WORKERS` — render worker-threads *per process*. In a cluster set
  this to `0` (each worker renders inline; the processes already parallelize).
  Single-process mode can set it to ~4 to use multiple cores for rendering.
- `UV_THREADPOOL_SIZE` — libuv threads per process for zlib SSH compression
  (`6` is fine per worker; raise for single-process).

Stats, leaderboard and chat are shared through the SQLite DB (WAL +
`busy_timeout`), so they're global across workers. Quick-match and the live
lounge shard per worker — fine at scale (each shard holds hundreds of players).
Measured: 6 workers on an 8-core box absorbed an 1100-connection burst with zero
errors. Tune with `src/loadtest.ts` (`node node_modules/tsx/dist/cli.mjs
src/loadtest.ts <N> <host> <port> <seconds>`).

## Notes
- Runs as your unprivileged user; it binds :22 via `CAP_NET_BIND_SERVICE` in the
  systemd unit, not root.
- To squeeze more players per core later, see the performance review: multiprocess
  workers, share the composed scene per match, and cut render allocation.
