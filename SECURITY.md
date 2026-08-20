# Security policy

## Supported version

Security fixes target the current `main` branch and the live server.

## Reporting a vulnerability

Please do not open a public issue for authentication bypasses, command execution, secret exposure, denial-of-service, or another exploitable flaw. Use [GitHub private vulnerability reporting](https://github.com/thomasdavis/sshfighter.com/security/advisories/new).

Include reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within 72 hours.

## Operator notes

- The game accepts password authentication only as a marker for an unverified guest. It does not validate or store the supplied password.
- Persistent identity comes from a verified SSH public-key fingerprint.
- Host keys, SQLite databases, Discord webhooks, gallery admin tokens, and model API keys are ignored and must be supplied outside Git.
- Discord delivery is optional and best-effort. Never include credentials, key material, or raw fingerprints in event fields.
- Discord receives only the vital-event allowlist. Local analytics may contain connection metadata and must not be exposed as an unfiltered public API.
- The optional terminal-capabilities layer (`SF_CAPS=1`) parses replies from the client terminal (graphics/keyboard probes, mouse, resize). It is off by default; when on, the parser treats all terminal input as untrusted, bounds its buffering, and only strips sequences it recognizes. The public REST API binds to loopback, serves read-only data, and clamps every list limit.
