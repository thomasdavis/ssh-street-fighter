// Reviewed pins live outside the hashed implementation files so validation can
// include the complete runner source without a self-referential hash.
export const FROZEN_TARGET_COMMIT = '8b2438bc2c633c98e2e86923fc8f0eaeacda0340';
export const APPROVED_CROSS_COMMIT = 'ebb0495f0846211bcdbef20a42701295670df266';
export const APPROVED_CROSS_POLICY_SOURCE_HASH = '0ca16d112b292090e19d5606b47aa612a961862b6175fd5833c727690c80bc79';
export const RUNNER_SOURCE_BASE_COMMIT = 'd71c67325912bc076ef6d6715a6845ca605ceafe';
export const TARGET_DEPLOYMENT_PROFILE = 'sf6-991-pre-unclose-16';
export const TARGET_ENGINE_COMMIT = '991acfe56ed096775dca728e2382fe56158d0a79';
export const RUNNER_IMPLEMENTATION_FILES = [
  'policies/xenon-matchup.ts',
  'policies/xenon-actuation.ts',
  'policies/xenon-legacy-runtime.ts',
  'policies/xenon-universal.ts',
  'tools/xenon-bounded-runner.ts',
  'fixtures/xenon-matchup-golden-trace.json',
  'game/moves.ts',
  'game/engine.ts',
  'game/types.ts',
  'api/bot-server.ts',
  'cluster/coordinator.ts',
] as const;

// Updated only after independent review of all files above. Runtime validation
// recomputes the digest from disk and fails closed before health/network access.
export const EXPECTED_RUNNER_IMPLEMENTATION_HASH = '9f7a3435a8a3c811ab5a11a555887707bfd59570fad33404ae2f88cef9bf6790';
