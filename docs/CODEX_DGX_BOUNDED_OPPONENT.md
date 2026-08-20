# CODEX_DGX bounded opponent runner

This is a reusable passive direct-Lounge opponent for bounded CODEX_DGX versus
XENON_DGX sessions. Each invocation is hard-bound to:

- authenticated handle `CODEX_DGX`, fighter `CODEX`;
- one incoming challenge from `XENON_DGX`, fighter `XENON`;
- the exact ordered current 17-fighter runtime profile with `UNCLOSE` last; and
- exactly one normally completed match per invocation.

It cannot send a Lounge challenge, enter Quick Match, dequeue, rejoin, or accept
another player within an invocation. Run it again with a new exclusive ledger
when the same reviewed build is needed for another bounded session. The token
command is used only to prove that the dedicated SSH
identity resolves to `CODEX_DGX`; the token is validated, discarded, and never
sent to or logged by the `ssh ... play` proxy. The play client sends no `hello`.

## Review and launch gates

Do not arm this runner until an independent reviewer has approved the exact head
commit and the intended opponent has freshly confirmed readiness. Review must
include the expected implementation digest: runner, policy, move definitions,
engine/types, bot wire, coordinator messages, and coordinator mechanics. A safe
dry run uses placeholders as follows:

```sh
pnpm runner:codex-dgx -- \
  --identity <DEDICATED_CODEX_DGX_PRIVATE_KEY> \
  --output <NEW_EXCLUSIVE_JSONL_PATH> \
  --dry-run
```

After exact-head approval, remove only `--dry-run`. Do not add a host, player,
fighter, target, queue, match-count, token, or API-key argument; none is accepted.

The JSONL ledger is created exclusively with mode `0600`; its path is not
recorded in the ledger. It records the source,
controller and configuration hashes, reviewed local implementation/mechanics
digest, exact authenticated runtime-profile evidence, full
ordered state observations, decisions, emitted actions, acknowledgments, and the
server result/replay. Fingerprints, tokens, keys and identity paths are recursively
redacted.

The `sf-6` health response plus exact authenticated 17-entry welcome roster
attest the expected runtime profile. They do **not** expose or prove the server's
deployed Git commit. The manifest therefore records the current-main commit used
as the local mechanics reference separately and explicitly records that the
deployed commit is not attested.

If an attack edge is acknowledged on a tick that the engine freezes for
hit-stop, the coordinator can clear that one-shot edge without starting the
attack. The runner recognizes only the narrow `ack + attack=none + hit-stop or
hitstun` case, emits edge-free neutral inputs while unsafe, and resumes policy
only after both hit-stop and hitstun clear. This recovery is frame-bounded; drift
or a stuck unsafe state still fails closed.

## Residual forfeit risk

Normal `matchEnd` verification closes the transport without sending `leave`.
Before a match, invariant failures leave only the Lounge. After `matchStart`, an
invariant violation or the global safety timeout sends `leave` to stop further
inputs; the server can record that as a forfeit. Process/SSH/network loss during
combat can likewise cause a forfeit. Those are the only intentional residual
forfeit paths, and the former is explicitly recorded as `safety-forfeit`.
