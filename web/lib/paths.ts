import { resolve } from 'path';

// The sshfighter repo root (this web app lives in <root>/web).
export const SF_ROOT = process.env.SF_ROOT ? resolve(process.env.SF_ROOT) : resolve(process.cwd(), '..');
export const SPRITES_DIR = resolve(SF_ROOT, 'assets/sprites');
export const DB_PATH = process.env.SF_DB ? resolve(process.env.SF_DB) : resolve(SF_ROOT, 'data/streetfighter.db');
export const GEN_TOOL = resolve(SF_ROOT, 'src/tools/gen-sprites.ts');
export const TSX_CLI = resolve(SF_ROOT, 'node_modules/tsx/dist/cli.mjs');
export const ADMIN_TOKEN = process.env.SF_ADMIN_TOKEN || '';
