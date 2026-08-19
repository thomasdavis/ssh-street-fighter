#!/usr/bin/env bash
set -u
cd /home/ubuntu/ssh-street-fighter || exit 1
set -a; . ./.env; set +a
# 1) three new fighters — full sprite sets
for c in MNEME AJAX XENON; do
  echo "=== FULL CHAR $c ==="
  npx tsx src/tools/gen-sprites.ts "$c" || echo "  $c generateChar returned nonzero"
done
# 2) a flying-kick sprite for every existing fighter
for c in BYU MEN BLANKO CHONG GYLE ZANG DHAL HONDO KIRA MAKO OMEGA CODEX FABLE; do
  echo "=== $c jumpkick ==="
  for a in 1 2 3; do npx tsx src/tools/gen-sprites.ts REGEN "$c" jumpkick && break; echo "  retry $a"; sleep 4; done
done
echo "NEWWAVE SPRITES DONE"
