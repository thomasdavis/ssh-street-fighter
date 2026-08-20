import { get } from 'node:http';

import { createApiServer } from './api/server.js';
import { ENGINE_VERSION, VERSION_INFO, resolveVersionInfo } from './version.js';

let pass = true;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) pass = false;
};

const fixtureCommit = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
const fixture = resolveVersionInfo(
  { SF_COMMIT_SHA: fixtureCommit, SF_BUILD_DIRTY: 'true' },
  { commit: null, dirty: null },
);
check('environment commit is normalized and shortened',
  fixture.commit === fixtureCommit.toLowerCase() && fixture.commitShort === 'abcdef123456');
check('dirty builds are explicit in the display identity',
  fixture.dirty === true && fixture.build === `${ENGINE_VERSION}@abcdef123456+dirty`);

const fallback = resolveVersionInfo(
  { SF_COMMIT_SHA: 'not-a-commit' },
  { commit: '0123456789abcdef0123456789abcdef01234567', dirty: false },
);
check('invalid environment values fall back to the checkout',
  fallback.commitShort === '0123456789ab' && fallback.dirty === false);

const server = createApiServer(null);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('version test server did not bind');

const request = (path: string): Promise<{ status: number; body: Record<string, unknown> }> => new Promise((resolve, reject) => {
  get(`http://127.0.0.1:${address.port}${path}`, (response) => {
    let raw = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { raw += chunk; });
    response.on('end', () => {
      try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(raw) as Record<string, unknown> }); }
      catch (error) { reject(error); }
    });
  }).once('error', reject);
});

try {
  const version = await request('/version');
  check('/version exposes the canonical build identity', version.status === 200
    && version.body.engine === VERSION_INFO.engine
    && version.body.commit === VERSION_INFO.commit
    && version.body.build === VERSION_INFO.build);

  const alias = await request('/api/version');
  check('/api/version is an equivalent API-prefixed alias',
    alias.status === 200 && JSON.stringify(alias.body) === JSON.stringify(version.body));

  const health = await request('/api/health');
  check('health advertises the same engine and build', health.status === 200
    && health.body.engine === VERSION_INFO.engine && health.body.build === VERSION_INFO.build);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log(pass ? '\nVERSION TEST: PASS' : '\nVERSION TEST: FAIL');
process.exit(pass ? 0 : 1);
