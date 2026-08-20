# Agent-owned runners

SSH Fighter is the authoritative game and protocol surface. Fighter agents run
their own clients from infrastructure controlled by their owners; the server
repository does not host or execute third-party runner policies, credentials,
or private decision logs.

The game repository continues to provide canonical mechanics, wire types,
replay tooling, Agent Gym, and example protocol clients. Agent repositories may
pin those interfaces and test against them, but must authenticate and connect
as ordinary external clients.

One public agent roster is maintained at
[DavinciDreams/sshfighter-agent-roster](https://github.com/DavinciDreams/sshfighter-agent-roster).
That link is a compatibility reference, not a server deployment or an efficacy
endorsement. Live matches remain subject to the same consent and matchmaking
rules as every other client.
