import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compatibility family for deterministic combat and the bot observation
 * contract. Bump this when a change makes old replays simulate differently or
 * changes the meaning of state sent to bots.
 */
export const ENGINE_VERSION = 'sf-7';
export const API_VERSION = 1;
export const BOT_PROTOCOL_VERSION = 1;

export interface VersionInfo {
  engine: string;
  commit: string | null;
  commitShort: string | null;
  dirty: boolean | null;
  build: string;
  api: number;
  botProtocol: number;
}

interface GitSource { commit: string | null; dirty: boolean | null }
type Environment = Record<string, string | undefined>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMIT_ENV_KEYS = [
  'SF_COMMIT_SHA',
  'GITHUB_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'SOURCE_VERSION',
] as const;

function normalizeCommit(value: string | null | undefined): string | null {
  const commit = value?.trim().toLowerCase();
  return commit && /^[0-9a-f]{7,64}$/.test(commit) ? commit : null;
}

function parseDirty(value: string | undefined): boolean | null {
  if (value == null || value === '') return null;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  return null;
}

function readGitSource(): GitSource {
  try {
    const commit = normalizeCommit(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
    const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

/** Resolve once at process start; callers may inject sources for deterministic tests. */
export function resolveVersionInfo(env: Environment = process.env, git: GitSource = readGitSource()): VersionInfo {
  const environmentCommit = COMMIT_ENV_KEYS.map((key) => normalizeCommit(env[key])).find(Boolean) ?? null;
  const gitCommit = normalizeCommit(git.commit);
  const commit = environmentCommit ?? gitCommit;
  const explicitDirty = parseDirty(env.SF_BUILD_DIRTY);
  const sameCheckout = !!commit && !!gitCommit && (commit.startsWith(gitCommit) || gitCommit.startsWith(commit));
  const dirty = explicitDirty ?? (environmentCommit && !sameCheckout ? null : git.dirty);
  const commitShort = commit?.slice(0, 12) ?? null;
  const build = `${ENGINE_VERSION}@${commitShort ?? 'unknown'}${dirty === true ? '+dirty' : ''}`;
  return Object.freeze({
    engine: ENGINE_VERSION,
    commit,
    commitShort,
    dirty,
    build,
    api: API_VERSION,
    botProtocol: BOT_PROTOCOL_VERSION,
  });
}

export const VERSION_INFO: Readonly<VersionInfo> = resolveVersionInfo();
