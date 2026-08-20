// Unit-tests the terminal capability pre-filter: it must strip terminal
// replies/events and dispatch them, while passing real keystrokes through
// untouched (arrows, letters, Escape) so the game parsers are unaffected.
import { Caps, type MouseEvent, type KittyKey } from './net/caps.js';

let pass = true;
const check = (n: string, c: boolean, x = ''): void => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };

interface Log { mouse: MouseEvent[]; keys: KittyKey[]; focus: boolean[]; resize: [number, number][]; pixel: [number, number][]; probe: { graphics: boolean; kittyKeyboard: boolean }[]; }
function make(): { caps: Caps; log: Log } {
  const log: Log = { mouse: [], keys: [], focus: [], resize: [], pixel: [], probe: [] };
  const caps = new Caps({
    onMouse: (e) => log.mouse.push(e),
    onKittyKey: (e) => log.keys.push(e),
    onFocus: (f) => log.focus.push(f),
    onResize: (c, r) => log.resize.push([c, r]),
    onPixelSize: (w, h) => log.pixel.push([w, h]),
    onProbeDone: (c) => log.probe.push(c),
  });
  return { caps, log };
}
const feed = (caps: Caps, s: string): string => caps.consume(Buffer.from(s, 'latin1')).toString('latin1');

// passthrough: normal keys + arrows are untouched (menu mode)
{
  const { caps } = make();
  check('plain keys pass through', feed(caps, 'abc') === 'abc');
  check('arrows pass through', feed(caps, '\x1b[A\x1b[D') === '\x1b[A\x1b[D');
  check('bare ESC passes through (no latency)', feed(caps, '\x1b') === '\x1b');
  check('SS3 arrow passes through', feed(caps, '\x1bOB') === '\x1bOB');
}

// mouse
{
  const { caps, log } = make();
  const rest = feed(caps, 'a\x1b[<0;10;5Mb');
  check('mouse stripped, keys kept', rest === 'ab');
  check('mouse down parsed', log.mouse.length === 1 && log.mouse[0]!.col === 10 && log.mouse[0]!.row === 5 && log.mouse[0]!.kind === 'down' && log.mouse[0]!.button === 0);
  feed(caps, '\x1b[<2;3;4m');
  check('mouse up parsed', log.mouse[1]!.kind === 'up' && log.mouse[1]!.button === 2);
  feed(caps, '\x1b[<64;1;1M\x1b[<65;1;1M');
  check('wheel up/down parsed', log.mouse[2]!.kind === 'wheel' && log.mouse[2]!.wheel === -1 && log.mouse[3]!.wheel === 1);
}

// focus, pixel size, in-band resize
{
  const { caps, log } = make();
  feed(caps, '\x1b[I\x1b[O');
  check('focus in/out', log.focus.join(',') === 'true,false');
  feed(caps, '\x1b[4;800;1200t');
  check('window pixel size', log.pixel[0]!.join(',') === '1200,800');
  feed(caps, '\x1b[48;40;120;640;960t');
  check('in-band resize', log.resize[0]!.join(',') === '120,40' && log.pixel[1]!.join(',') === '960,640');
}

// probe flow: graphics + kitty replies then DA fence
{
  const { caps, log } = make();
  const rest = feed(caps, '\x1b_Gi=4207;OK\x1b\\\x1b[?5u\x1b[?62;1;c');
  check('probe replies fully stripped', rest === '');
  check('graphics + keyboard detected', caps.graphics && caps.kittyKeyboard);
  check('probe done fired once', log.probe.length === 1 && log.probe[0]!.graphics && log.probe[0]!.kittyKeyboard);
}
{
  const { caps, log } = make();
  feed(caps, '\x1b[?62;c');   // DA with no prior graphics/keyboard replies
  check('no-graphics terminal → unsupported', !caps.graphics && !caps.kittyKeyboard && log.probe[0]!.graphics === false);
}

// kitty key events (only while active)
{
  const { caps, log } = make();
  check('CSI-u passes through when inactive', feed(caps, '\x1b[119u') === '\x1b[119u');
  caps.kittyKeyActive = true;
  feed(caps, '\x1b[119u');                 // 'w' press
  feed(caps, '\x1b[119;1:3u');             // 'w' release
  feed(caps, '\x1b[1;1:3A');               // up-arrow release
  check('kitty key press', log.keys[0]!.ch === 'w' && log.keys[0]!.event === 'press');
  check('kitty key release', log.keys[1]!.ch === 'w' && log.keys[1]!.event === 'release');
  check('kitty arrow release', log.keys[2]!.arrow === 'A' && log.keys[2]!.event === 'release');
}

// carry: a split mouse sequence across two reads
{
  const { caps, log } = make();
  const a = feed(caps, 'x\x1b[<0;10;');
  const b = feed(caps, '5M');
  check('split sequence carried + reassembled', a === 'x' && b === '' && log.mouse.length === 1 && log.mouse[0]!.col === 10);
}

console.log(`\nCAPS TEST: ${pass ? 'PASS' : 'FAIL'}`);
if (!pass) process.exit(1);
