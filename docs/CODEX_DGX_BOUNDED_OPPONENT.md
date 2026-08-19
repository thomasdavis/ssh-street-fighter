# CODEX_DGX bounded opponent runner

This runner exists for one coordinated, direct-Lounge transport validation on
the deployed `sf6-d71-UNCLOSE-17` surface. It is hard-bound to:

- authenticated handle `CODEX_DGX`, fighter `CODEX`;
- one incoming challenge from `XENON_DGX`, fighter `XENON`;
- the exact ordered d71 17-fighter roster with `UNCLOSE` appended; and
- exactly one normally completed match.

It cannot send a Lounge challenge, enter Quick Match, dequeue, rejoin, or accept
another player. The token command is used only to prove that the dedicated SSH
identity resolves to `CODEX_DGX`; the token is validated, discarded, and never
sent to or logged by the `ssh ... play` proxy. The play client sends no `hello`.

## Review and launch gates

Do not arm this runner until an independent reviewer has approved the exact head
commit and the intended opponent has freshly confirmed readiness. A safe dry run
uses placeholders as follows:

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
controller and configuration hashes, exact deployment/roster attestation, full
ordered state observations, decisions, emitted actions, acknowledgments, and the
server result/replay. Fingerprints, tokens, keys and identity paths are recursively
redacted.

## Residual forfeit risk

Normal `matchEnd` verification closes the transport without sending `leave`.
Before a match, invariant failures leave only the Lounge. After `matchStart`, an
invariant violation or the global safety timeout sends `leave` to stop further
inputs; the server can record that as a forfeit. Process/SSH/network loss during
combat can likewise cause a forfeit. Those are the only intentional residual
forfeit paths, and the former is explicitly recorded as `safety-forfeit`.
