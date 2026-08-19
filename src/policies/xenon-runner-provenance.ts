// Reviewed pins live outside the hashed implementation files so validation can
// include the complete runner source without a self-referential hash.
export const FROZEN_TARGET_COMMIT = '8b2438bc2c633c98e2e86923fc8f0eaeacda0340';
export const APPROVED_CROSS_COMMIT = 'ebb0495f0846211bcdbef20a42701295670df266';
export const APPROVED_CROSS_POLICY_SOURCE_HASH = '0ca16d112b292090e19d5606b47aa612a961862b6175fd5833c727690c80bc79';
export const RUNNER_SOURCE_BASE_COMMIT = 'd71c67325912bc076ef6d6715a6845ca605ceafe';
export const TARGET_DEPLOYMENT_PROFILE = 'sf6-d71-unclose-17';
export const TARGET_ENGINE_COMMIT = 'd71c67325912bc076ef6d6715a6845ca605ceafe';
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
export const EXPECTED_RUNNER_IMPLEMENTATION_HASH = '189ff93e503de55e1a0b1abe9408f27b46dbc440faa9184e55379884ca1b5485';
