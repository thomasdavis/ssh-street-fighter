#!/usr/bin/env bash
# Resume throw/thrown sprite generation for fighters that still lack them.
# Skips poses already present so re-runs are cheap. OMEGA is intentionally
# excluded: it was reverted to its original dark art and must not be regen'd
# in the current (pastel) brief.
set -u
cd /home/ubuntu/ssh-street-fighter || exit 1

# gen-sprites.ts reads OPENAI_API_KEY / SF_IMG_MODEL straight from process.env
# (no dotenv), so load .env here or every call no-ops with a null client.
set -a; . ./.env; set +a

FIGHTERS="CHONG CODEX DHAL FABLE GYLE HONDO KIRA MAKO ZANG"
POSES="throw_1 throw_2 throw_3 thrown_1 thrown_2"

for c in $FIGHTERS; do
  for p in $POSES; do
    if [ -f "assets/sprites/$c/$p.json" ]; then
      echo "=== $c $p (skip, exists) ==="
      continue
    fi
    echo "=== $c $p ==="
    for attempt in 1 2 3; do
      if npx tsx src/tools/gen-sprites.ts REGEN "$c" "$p"; then
        break
      fi
      echo "  attempt $attempt failed for $c/$p; retrying"
      sleep 5
    done
  done
done
echo "ALL THROW SPRITES DONE"
