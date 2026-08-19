#!/usr/bin/env bash
set -u
cd /home/ubuntu/ssh-street-fighter || exit 1
set -a; . ./.env; set +a
for p in throw_1 throw_2 throw_3 thrown_1 thrown_2; do
  echo "=== OMEGA $p ==="
  for attempt in 1 2 3; do
    if npx tsx src/tools/gen-sprites.ts REGEN OMEGA "$p"; then break; fi
    echo "  attempt $attempt failed; retry"; sleep 5
  done
done
echo "OMEGA THROW SPRITES DONE"
