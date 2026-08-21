process.env.SF_DB = ':memory:';
const db = await import('./db/db.js');
db.initDb();
const seed = (fp: string, name: string, w: number, l: number) => {
  db.touchOrCreate(fp); db.setUsername(fp, name);
  for (let i = 0; i < w; i++) db.recordMatch(fp, null, name, 'x', 'BYU', 'MEN', 2);
  for (let i = 0; i < l; i++) db.recordMatch(null, fp, 'x', name, 'BYU', 'MEN', 2);
};
seed('fp:ada', 'ADA', 12, 3); seed('fp:tom', 'THOMAS', 7, 5); seed('fp:kai', 'KAI', 4, 9);

const { Frame } = await import('./render/frame.js');
const { SCREENS } = await import('./screens/index.js');

function fake(o: Record<string, unknown>): any {
  return {
    frame: 6, displayName: 'THOMAS', usernameBuf: 'THOM', errorMsg: '', guest: false,
    player: db.getByFingerprint('fp:tom'), fp: 'fp:tom', menuIndex: 0, cursor: 0,
    selectMode: 'lobby', quickOpponentPool: 'bots', leaderScope: 'humans', leader: db.leaderboard(10, 'humans'), result: null, ...o,
  };
}

const which = process.argv[2] ?? 'menu';
const cols = parseInt(process.argv[3] ?? '96', 10), rows = parseInt(process.argv[4] ?? '30', 10);
const f = new Frame(cols, rows);
const s = fake(which === 'results' ? { result: { winner: 'THOMAS', loser: 'ADA', winnerIsBot: false, loserIsBot: false, youWon: true } } : {});
if (which === 'help') { SCREENS.menu.render(s, f); SCREENS.help.render(s, f); }
else (SCREENS as any)[which].render(s, f);

const plain = process.argv.includes('--plain');
const rowsOut = f.toRows();
if (plain) {
  // strip SGR for a readability check
  process.stdout.write(rowsOut.map((r: string) => r.replace(/\x1b\[[0-9;]*m/g, '')).join('\n') + '\n');
} else {
  process.stdout.write('\x1b[2J\x1b[H' + rowsOut.join('\n') + '\x1b[0m\n');
}
