export type TvAdvanceReason = 'initial' | 'live-arrived' | 'live-ended' | 'replay-complete' | 'retry';

export const TV_LIVE_MISSING_GRACE_MS = 1_500;

/** Live programming is never preempted. Replays may yield to a newly arrived
 * live bout, while the current live bout advances only after that exact bout
 * has left the live API. Binding the release to a match id prevents a delayed
 * response from an older program from changing the channel. */
export function tvCanAdvance(
  current: 'live' | 'replay',
  reason: TvAdvanceReason,
  currentLiveMid: string | null = null,
  endedLiveMid: string | null = null,
): boolean {
  if (current === 'replay') return true;
  return reason === 'live-ended' && currentLiveMid !== null && currentLiveMid === endedLiveMid;
}

/** A single missing frame response must not knock TV off a healthy fight. */
export function tvLiveMissingLongEnough(missingSince: number | null, now: number): boolean {
  return missingSince !== null && now - missingSince >= TV_LIVE_MISSING_GRACE_MS;
}
