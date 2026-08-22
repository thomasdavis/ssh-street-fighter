export type TvAdvanceReason = 'initial' | 'live-arrived' | 'live-ended' | 'replay-complete' | 'retry';

/** Live programming is never preempted. Replays may yield to a newly arrived
 * live bout, while the current live bout advances only after its own end. */
export function tvCanAdvance(current: 'live' | 'replay', reason: TvAdvanceReason): boolean {
  return current === 'replay' || reason === 'live-ended';
}
