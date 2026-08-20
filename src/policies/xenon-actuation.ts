// Pure state machine for converting XENON policy intents into the exact
// one-shot input protocol used by the bounded runner. It has no I/O, timers,
// engine access, or hidden state; the live runner and offline simulator share it.
import { specialMoveForAttack, specialMoveMotionCode } from '../game/moves.js';
import type { SpecialAttack } from '../game/moves.js';
import { ATTACKS, JUMPKICK, THROW, specialMoveStats } from '../game/engine.js';
import { emptyInputs, type AttackKind, type Inputs, type MatchPhase } from '../game/types.js';

export const ACK_TIMEOUT_FRAMES = 30;
export const RETRY_AFTER_FRAMES = 3;
export const MAX_EDGE_ATTEMPTS = 2;
export const PENDING_HARD_TIMEOUT_FRAMES = 180;
export type ActuationSafetyProfile = 'frozen' | 'legacy-delay';

export interface ActuationFighter {
  attack: AttackKind;
  stun: number;
  facing: 1 | -1;
  x: number;
  y: number;
  vy: number;
}

export interface ActuationOpponent {
  attack: AttackKind;
  attackFrame: number;
  stun: number;
  facing: 1 | -1;
  x: number;
  active: boolean;
  casting: boolean;
}

export interface ActuationObservation {
  frame: number;
  ack: number;
  phase: MatchPhase;
  hitStop: number;
  you: ActuationFighter;
  opponent: ActuationOpponent;
  /** Age of this public observation when consumed by the actuator. */
  observationAgeFrames: number;
  /** Remaining configured delay from emission to coordinator application. */
  applicationDelayFrames: number;
}

interface PendingEdge {
  intent: Inputs;
  expectedAttack: AttackKind | 'unknown';
  attempt: number;
  sentSeq: number;
  sentFrame: number;
  firstSentFrame: number;
  ackObservedFrame: number | null;
  /** First public frame proving an already-acked edge was intercepted by hitstun. */
  ackedHitstunFrame: number | null;
}

export interface ActuationAudit {
  event: 'pending-abandoned' | 'motion-reset-confirmed' | 'attack-confirmed' | 'edge-deferred';
  payload: Record<string, unknown>;
}

export interface ActuationEmission {
  input: Inputs;
  intent: Inputs;
  reason: string;
  sequence: number;
  inboundAck: number;
  ackLedger: {
    localSeq: number;
    lastAck: number;
    pending: null | Omit<PendingEdge, 'intent'> & { intent: Inputs };
  };
}

export interface ActuationStep {
  audits: ActuationAudit[];
  emission?: ActuationEmission;
  failure?: string;
}

export function hasAttackEdge(input: Inputs): boolean {
  // Preserve the approved runner's fail-closed treatment of any policy motion
  // token as an edge-bearing intent, even if its button is accidentally absent.
  return input.punch || input.kick || input.throw || input.motion.length > 0;
}

export function withoutEdges(input: Inputs): Inputs {
  // The coordinator merges `incoming.motion || previous.motion`; `N` is the
  // explicit neutral token that clears a sticky special motion.
  return { ...input, jump: false, punch: false, kick: false, throw: false, motion: 'N' };
}

/** Mirrors the deployed engine's free-facing rule exactly, including equality. */
export function engineFacingFromWire(
  you: Pick<ActuationFighter, 'x' | 'facing'>,
  opponent: Pick<ActuationOpponent, 'x'>,
): 1 | -1 {
  return opponent.x === you.x ? you.facing : opponent.x > you.x ? 1 : -1;
}

export function projectedActuationRisk(observation: ActuationObservation): string | null {
  const { you, opponent, hitStop } = observation;
  if (hitStop > 0) return 'hitstop';
  if (you.stun > 0) return 'self-stun';
  if (opponent.attack === 'none') return null;
  const horizon = observation.observationAgeFrames + observation.applicationDelayFrames;
  const distance = Math.abs(opponent.x - you.x);
  const window = canonicalAttackWindow(opponent.attack);
  if (!window) return null;
  const projectedAttackFrame = opponent.attackFrame + horizon;
  const nearActiveStart = Math.max(0, window.startup - 2);
  const activeEnd = window.startup + window.active;
  // `active` and `casting` are the deployed public wire semantics. Canonical
  // timing projects those semantics to application time; inactive recovery is
  // explicitly safe and never blanket-classified as a commitment.
  const projectsIntoThreat = projectedAttackFrame >= nearActiveStart && projectedAttackFrame < activeEnd;
  if (!projectsIntoThreat && !opponent.active && !opponent.casting) return null;
  if (projectedAttackFrame >= activeEnd) return null;
  const projectedReach = window.range + Math.min(18, horizon * 2.3);
  if (distance <= projectedReach)
    return `opponent-${opponent.attack}-commitment`;
  return null;
}

function canonicalAttackWindow(attack: AttackKind): { startup: number; active: number; range: number } | null {
  if (attack === 'punch' || attack === 'kick') return ATTACKS[attack];
  if (attack === 'jumpkick') return JUMPKICK;
  if (attack === 'throw') return THROW;
  try {
    const stats = specialMoveStats(attack as SpecialAttack);
    return { startup: stats.startup, active: stats.active, range: stats.range };
  } catch {
    return null;
  }
}

function guardedRetreat(observation: ActuationObservation): Inputs {
  const facing = engineFacingFromWire(observation.you, observation.opponent);
  // Holding away is the deployed guard input. Do not also crouch: the exact
  // engine disables horizontal movement while crouching, defeating retreat.
  return { ...emptyInputs(), moveX: -facing as 1 | -1, motion: 'N' };
}

export function intendedXenonAttack(input: Inputs): AttackKind | 'unknown' {
  if (input.motion) {
    for (const attack of ['phase', 'reflect', 'blink'] as const) {
      const definition = specialMoveForAttack('XENON', attack);
      if (definition
          && [specialMoveMotionCode(definition, 1), specialMoveMotionCode(definition, -1)].includes(input.motion)
          && input[definition.button]) return attack;
    }
  }
  if (input.throw) return 'throw';
  if (input.punch) return 'punch';
  if (input.kick) return 'kick';
  return 'unknown';
}

function expectedAttackAtObservation(input: Inputs, you: ActuationFighter): AttackKind | 'unknown' {
  const intended = intendedXenonAttack(input);
  // A plain kick requested while the public wire observation is airborne is
  // canonically a jumpkick. Specials deliberately retain their named expected
  // attack: silently accepting a normal caused by a stale/invalid motion would
  // hide the exact actuation failure this latch is designed to detect.
  if (intended === 'kick' && you.y > 0) return 'jumpkick';
  return intended;
}

/** Re-materialize canonical special motion at send/retry time using current facing. */
export function materializeExecutionFacing(input: Inputs, facing: 1 | -1): Inputs {
  const attack = intendedXenonAttack(input);
  if (attack !== 'phase' && attack !== 'reflect' && attack !== 'blink') return { ...input };
  const definition = specialMoveForAttack('XENON', attack);
  if (!definition) throw new Error(`XENON canonical move missing for ${attack}`);
  return { ...input, motion: specialMoveMotionCode(definition, facing) };
}

export function createXenonActuator(
  options: { safetyProfile?: ActuationSafetyProfile } = {},
) {
  const safetyProfile = options.safetyProfile ?? 'frozen';
  const legacySafety = safetyProfile === 'legacy-delay';
  let localSeq = 0;
  let lastAck = 0;
  let pending: PendingEdge | null = null;
  let lastPhase: MatchPhase | null = null;
  let needsMotionReset = false;
  let motionResetSeq: number | null = null;
  let safeWindowStartFrame: number | null = null;
  let selfRecoveryStartFrame: number | null = null;
  let selfRecoveryWindowRequired = false;
  let lastConfirmedAttack: AttackKind | null = null;
  let lastConfirmedFrame: number | null = null;

  const snapshotPending = (): ActuationEmission['ackLedger']['pending'] => pending
    ? { ...pending, intent: { ...pending.intent } }
    : null;

  const emit = (input: Inputs, intent: Inputs, observation: ActuationObservation, reason: string): ActuationEmission => {
    const sequence = ++localSeq;
    return {
      input: { ...input }, intent: { ...intent }, reason, sequence, inboundAck: observation.ack,
      ackLedger: { localSeq, lastAck, pending: snapshotPending() },
    };
  };

  const step = (observation: ActuationObservation, decide: () => Inputs): ActuationStep => {
    const audits: ActuationAudit[] = [];
    const { frame, ack, phase, hitStop, you } = observation;
    if (!Number.isInteger(frame) || !Number.isInteger(ack) || !Number.isFinite(hitStop))
      return { audits, failure: 'invalid actuation observation' };
    if (!Number.isInteger(observation.observationAgeFrames) || observation.observationAgeFrames < 0
        || observation.observationAgeFrames > 30
        || !Number.isInteger(observation.applicationDelayFrames) || observation.applicationDelayFrames < 0
        || observation.applicationDelayFrames > 30)
      return { audits, failure: 'invalid actuation freshness/horizon' };
    if (ack < lastAck || ack > localSeq)
      return { audits, failure: `invalid ack progression ${lastAck}->${ack}/${localSeq}` };
    lastAck = ack;

    if (phase !== 'fight') {
      safeWindowStartFrame = null;
      selfRecoveryStartFrame = null;
      selfRecoveryWindowRequired = false;
      lastConfirmedAttack = null;
      lastConfirmedFrame = null;
      if (pending) {
        audits.push({ event: 'pending-abandoned', payload: {
          frame, fromPhase: lastPhase, toPhase: phase, expectedAttack: pending.expectedAttack,
          attempt: pending.attempt, sentSeq: pending.sentSeq,
        } });
        pending = null;
        if (phase !== 'match-over') needsMotionReset = true;
      }
      if (phase === 'round-over') needsMotionReset = true;
      lastPhase = phase;
      return { audits };
    }
    lastPhase = phase;

    const actuationRisk = legacySafety ? projectedActuationRisk(observation) : null;
    if (actuationRisk) safeWindowStartFrame = null;
    else if (safeWindowStartFrame === null) safeWindowStartFrame = frame;
    const executionHorizon = observation.observationAgeFrames + observation.applicationDelayFrames;
    const horizonSafe = !actuationRisk && safeWindowStartFrame !== null
      && frame - safeWindowStartFrame >= executionHorizon;
    if (actuationRisk === 'hitstop' || actuationRisk === 'self-stun') {
      selfRecoveryWindowRequired = true;
      selfRecoveryStartFrame = null;
    } else if (selfRecoveryWindowRequired && selfRecoveryStartFrame === null) {
      selfRecoveryStartFrame = frame;
    }
    const selfRecoverySafe = !selfRecoveryWindowRequired
      || (actuationRisk === null && selfRecoveryStartFrame !== null
        && frame - selfRecoveryStartFrame >= executionHorizon);
    if (selfRecoverySafe) selfRecoveryWindowRequired = false;

    if (needsMotionReset) {
      if (motionResetSeq === null) {
        const reset = { ...emptyInputs(), motion: 'N' };
        motionResetSeq = localSeq + 1;
        return { audits, emission: emit(reset, reset, observation, 'round-motion-reset') };
      }
      if (ack < motionResetSeq) return { audits };
      audits.push({ event: 'motion-reset-confirmed', payload: { frame, ack, resetSeq: motionResetSeq } });
      needsMotionReset = false;
      motionResetSeq = null;
    }

    if (pending && ack >= pending.sentSeq && you.attack !== 'none') {
      if (pending.expectedAttack === 'unknown')
        return { audits, failure: `cannot confirm unknown intended attack at frame ${frame}` };
      if (you.attack !== pending.expectedAttack)
        return { audits, failure: `attack confirmation mismatch: expected ${pending.expectedAttack}, got ${you.attack}` };
      audits.push({ event: 'attack-confirmed', payload: {
        frame, actualAttack: you.attack, expectedAttack: pending.expectedAttack,
        attempt: pending.attempt, sentSeq: pending.sentSeq, ack,
      } });
      lastConfirmedAttack = you.attack;
      lastConfirmedFrame = frame;
      pending = null;
    }
    if (pending && ack >= pending.sentSeq && pending.ackObservedFrame === null)
      pending.ackObservedFrame = frame;
    if (legacySafety && pending && ack >= pending.sentSeq && you.stun > 0
        && pending.ackedHitstunFrame === null)
      pending.ackedHitstunFrame = frame;
    if (pending && ack < pending.sentSeq && frame - pending.sentFrame > ACK_TIMEOUT_FRAMES)
      return { audits, failure: `input ack timeout at frame ${frame}` };
    if (!legacySafety && pending && ack >= pending.sentSeq && frame - pending.sentFrame > ACK_TIMEOUT_FRAMES)
      return { audits, failure: `attack retry timeout at frame ${frame}` };
    if (legacySafety && pending && frame - pending.firstSentFrame >= PENDING_HARD_TIMEOUT_FRAMES)
      return { audits, failure: `hard pending timeout at frame ${frame}` };

    // The coordinator coalesces all inputs received before its next tick. An
    // edge followed by an edge-free `motion: 'N'` can therefore preserve the
    // sticky kick while overwriting the special motion, degrading Phase into a
    // normal kick. Until the edge is authoritative in ack, emit nothing at all.
    if (pending && ack < pending.sentSeq) return { audits };

    const intent = decide();
    if (legacySafety && pending && pending.attempt >= MAX_EDGE_ATTEMPTS
        && pending.ackedHitstunFrame !== null
        && actuationRisk === null && horizonSafe && selfRecoverySafe) {
      audits.push({ event: 'pending-abandoned', payload: {
        frame, reason: 'acked-edge-intercepted-by-hitstun', expectedAttack: pending.expectedAttack,
        attempt: pending.attempt, sentSeq: pending.sentSeq, hitstunFrame: pending.ackedHitstunFrame,
      } });
      pending = null;
    }
    if (pending) {
      const intendedReplacement = intendedXenonAttack(intent);
      const replaceWithReflect = legacySafety && intendedReplacement === 'reflect'
        && pending.expectedAttack !== 'reflect' && ack >= pending.sentSeq
        && pending.ackObservedFrame !== null && you.attack === 'none' && you.stun <= 0 && hitStop === 0;
      if (replaceWithReflect) {
        audits.push({ event: 'pending-abandoned', payload: {
          frame, reason: 'acked-no-start-urgent-reflect', expectedAttack: pending.expectedAttack,
          attempt: pending.attempt, sentSeq: pending.sentSeq,
        } });
        pending = null;
      }
    }
    if (pending) {
      const risk = legacySafety ? actuationRisk ?? (!horizonSafe ? 'freshness-window' : null) : null;
      const freshAfterAck = !legacySafety || (pending.ackObservedFrame !== null
        && frame - pending.ackObservedFrame >= Math.max(1, observation.observationAgeFrames));
      if (risk) {
        audits.push({ event: 'edge-deferred', payload: {
          frame, reason: risk, kind: 'pending-retry', attempt: pending.attempt,
          horizon: executionHorizon,
        } });
      } else if (ack >= pending.sentSeq && freshAfterAck && frame - pending.sentFrame >= RETRY_AFTER_FRAMES) {
        if (pending.attempt >= MAX_EDGE_ATTEMPTS)
          return { audits, failure: `attack start timeout at frame ${frame}` };
        if (you.stun <= 0 && you.attack === 'none' && hitStop === 0) {
          pending.attempt++;
          pending.sentFrame = frame;
          pending.sentSeq = localSeq + 1;
          pending.ackObservedFrame = null;
          pending.ackedHitstunFrame = null;
          const retry = materializeExecutionFacing(pending.intent, engineFacingFromWire(you, observation.opponent));
          return { audits, emission: emit(retry, intent, observation, 'acked-no-start-retry') };
        }
      }
      const reason = risk ? 'unsafe-pending-edge-deferred'
        : hitStop > 0 ? 'hitstop-pending-edge-suppressed' : 'pending-edge-suppressed';
      const fallback = risk ? guardedRetreat(observation) : withoutEdges(intent);
      return { audits, emission: emit(fallback, intent, observation, reason) };
    }

    if (hitStop > 0)
      return { audits, emission: emit(withoutEdges(intent), intent, observation, 'hitstop-edge-suppressed') };

    if (hasAttackEdge(intent)) {
      const risk = legacySafety ? actuationRisk ?? (!selfRecoverySafe ? 'self-recovery-freshness-window' : null) : null;
      if (risk) {
        audits.push({ event: 'edge-deferred', payload: {
          frame, reason: risk, kind: 'new-edge', attempt: 0,
          horizon: executionHorizon,
        } });
        return { audits, emission: emit(withoutEdges(intent), intent, observation, 'unsafe-new-edge-deferred') };
      }
      const executionInput = materializeExecutionFacing(intent, engineFacingFromWire(you, observation.opponent));
      const expectedAttack = expectedAttackAtObservation(executionInput, you);
      if (expectedAttack === 'unknown') return { audits, failure: 'policy emitted an unrecognized attack edge' };
      pending = {
        intent: { ...intent }, expectedAttack, attempt: 1,
        sentSeq: localSeq + 1, sentFrame: frame, firstSentFrame: frame, ackObservedFrame: null,
        ackedHitstunFrame: null,
      };
      return { audits, emission: emit(executionInput, intent, observation, 'new-canonical-edge') };
    }
    const level = { ...intent, motion: intent.motion || 'N' };
    return { audits, emission: emit(level, intent, observation, 'level-or-jump') };
  };

  return {
    step,
    status: () => ({
      localSeq, lastAck, pending: snapshotPending(), lastPhase, needsMotionReset, motionResetSeq,
      safeWindowStartFrame, selfRecoveryStartFrame, selfRecoveryWindowRequired,
      safetyProfile, lastConfirmedAttack, lastConfirmedFrame,
    }),
  };
}
