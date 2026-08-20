// Reviewed pins live outside the hashed implementation files so the runner
// source can be covered without creating a self-referential digest.
export const CURRENT_MAIN_BASE_COMMIT = '3caedf3435c12996cf4d34fb5ac76c7cd7b75076';
export const MECHANICS_REFERENCE_COMMIT = CURRENT_MAIN_BASE_COMMIT;
export const EXPECTED_RUNTIME_PROFILE = 'sf-6/current17-unclose';

export const CODEX_RUNNER_IMPLEMENTATION_FILES = [
  'tools/codex-dgx-bounded-opponent.ts',
  'bot/adaptive-codex-policy.ts',
  'game/moves.ts',
  'game/engine.ts',
  'game/types.ts',
  'api/bot-server.ts',
  'cluster/messages.ts',
  'cluster/coordinator.ts',
] as const;

// Updated only after review of every file above. The runner recomputes this
// digest from disk and fails closed before health, token, or SSH access.
export const EXPECTED_CODEX_RUNNER_IMPLEMENTATION_HASH = '1a8a59e3866d9621ae7270ba7857ab3d96f314e5cde08c212be681bad1e2f9b0';
