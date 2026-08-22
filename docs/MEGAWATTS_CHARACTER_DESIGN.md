# MEGAWATTS — SSH Fighter character design v2

Status: playable submission candidate
Concept art: [screenshots/megawatts-concept.png](screenshots/megawatts-concept.png)

## Character identity

- **Name:** MEGAWATTS
- **Tagline:** the voltage laureate
- **Origin:** The black-start academy
- **Discipline:** Grid calculus and aerial pedagogy
- **Archetype:** Adaptive air-control all-rounder
- **Difficulty:** Intermediate
- **Quote:** “Power is a question. Timing is the proof.”

MEGAWATTS rebuilt a storm-struck campus microgrid from abandoned lab hardware,
then opened every diagram and lesson to the neighborhoods around it. She enters
the circuit after seeing XENON turn perfect evasion into a closed argument. She
does not disable his tools; she makes him solve two visible trajectories instead
of one.

Visually, she is an athletic adult woman with warm brown skin, a platinum
micro-braid lightning crest, a black cropped academic-bomber jacket, ultraviolet
wing-like coat tails, and hot-gold copper coils on gauntlets and boots. Her
“bombs” are fantastical faceted knowledge cores, not realistic ordnance.

## Kit and implementation budget

The kit uses two existing attack primitives and introduces one narrowly scoped
primitive: a projectile with a constant horizontal delta and a constant downward
delta. It adds no general projectile gravity, acceleration, landing, arming,
pulse, homing, target tracking, or persistent hazard state.

### Citation Bolt — `↓ → + W`

This is the standard `hadouken` mechanic with MEGAWATTS' citation visual style:
spawn frame 11, total 32, 12 damage, 3 chip, one hit. It follows the existing
projectile collision, cancellation, phase, block, armor, and Reflect rules.

### Bombs of Knowledge — `↓ ↑ + W`

MEGAWATTS commits to the existing fighter jump integrator and releases two
conventional knowledge cores on fixed descending diagonals.

| Property | Candidate value |
|---|---:|
| Releases | frames 10 and 27 |
| Total commitment | 48 frames |
| Fighter launch | `jumpV 8.0`, `vx 2.8` |
| Core trajectory | `vx 2.1`, down `2.8` per frame |
| Damage / chip | 7 / 2 per core |
| Radius | 8 |
| Invulnerability / armor | none |

The 17-frame release spacing is longer than Reflect's 15 active frames. One
perfect Reflect cannot cover both releases, but either core can be reflected.
Phase passes through either core while intangible. This is a timing challenge,
not a hard-counter flag. The long air arc gives Blink a clear launch or landing
punish, and each core disappears on hit or after leaving the arena.

### Ground Truth — `↓ ↑ + E`

This is the established `electric` close multi-hit field with MEGAWATTS' coil
visuals: 3 startup, 21 active, 7 recovery, up to four 4-damage hits, 1 chip per
hit, range 31, vertical reach 52. It is omnidirectional but gives no armor or
invulnerability. XENON remains unharmed during intangibility and can bait or
punish the commitment.

## XENON matchup

XENON's defining asymmetry is compressed neutral: Phase is intangible and
crosses through, Reflect both evades and reverses a projectile, and Blink creates
point-blank threat without traversing the lane. MEGAWATTS challenges those
options through visible timing and position rather than disabling them.

| XENON option | MEGAWATTS' challenge | XENON's answer |
|---|---|---|
| Reflect a lane shot | Citation is honestly reflected; staggered cores ask for two timings | Reflect one, Phase/jump/leave the other, or Blink the launch |
| Phase through pressure | A second diagonal can arrive after the first phase decision | Change endpoint or timing; remain mobile after rematerializing |
| Blink point-blank | Ground Truth covers both sides on a prediction | Bait it, block it, throw, or punish its recovery |
| Wait for overextension | The air arc advances MEGAWATTS while drawing two lanes | Chase the landing or take uncontested space elsewhere |

There is no opponent-specific engine behavior: the same trajectories,
reflection, phase interaction, damage, and recovery apply in every matchup.

## Power posture and tuning order

MEGAWATTS is intended to enter the same practical power conversation as XENON
and MNEME. Her power is split across visible commitments: no teleport, healing,
reflection, homing, autonomous construct, true invulnerability, or instant
full-screen hit.

If validation shows excess strength, tune commitments before erasing the aerial
fantasy:

1. Increase bombardment total/landing recovery.
2. Increase the gap before the first or second release.
3. Reduce fighter launch drift.
4. Reduce core damage only after the commitment levers are exhausted.

## Gameplay contract

- Mechanics: constant diagonal deltas; exactly two releases; reflection and
  Phase work normally; no new projectile state; no armor/invulnerability.
- Compatibility: all pre-existing engine, roster, renderer, replay, and asset
  tests continue to pass unchanged.
