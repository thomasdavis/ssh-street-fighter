import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import type { MouseEvent } from '../net/caps.js';
import { username } from './username.js';
import { menu } from './menu.js';
import { select } from './select.js';
import { lobbyWait } from './lobby.js';
import { leaderboard } from './leaderboard.js';
import { results } from './results.js';
import { helpOverlay } from './help.js';
import { lounge } from './lounge.js';
import { controls } from './controls.js';
import { calibrate } from './calibrate.js';

export type ScreenName = 'calibrate' | 'username' | 'menu' | 'select' | 'lobbyWait' | 'lounge' | 'leaderboard' | 'controls' | 'results' | 'fight';

export interface Screen {
  render(s: Session, f: Frame): void;
  onKey(s: Session, k: Key): void;
  tick?(s: Session): void;
  /** Optional mouse handling. `col`/`row` are 1-based cells; `pw`/`ph` are the
   *  pixel-layer size (cols*2 x rows*4) so screens can hit-test their layout. */
  onMouse?(s: Session, e: MouseEvent, pw: number, ph: number): void;
}

// 'fight' rendering is handled directly by the Session loop.
const fightStub: Screen = { render: () => {}, onKey: () => {} };

export const SCREENS: Record<ScreenName, Screen> & { help: { render(s: Session, f: Frame): void } } = {
  calibrate, username, menu, select, lobbyWait, lounge, leaderboard, controls, results, fight: fightStub, help: helpOverlay,
};
