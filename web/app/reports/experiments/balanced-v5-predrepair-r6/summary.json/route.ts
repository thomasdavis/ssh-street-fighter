const incumbent = {
  checkpointSha256: 'd377c5476b8e690bc6c1e5e20a00290e0ec2625cc111d2893b2542afd42dea4d',
  offlineMetrics: {
    totalLoss: 2.9384675,
    policyLoss: 2.3460016,
    policyAccuracy: 0.5427551,
    predictionLoss: 0.01556408,
    opponentLoss: 2.9471064,
    valueLoss: 0.39532447,
    dangerLoss: 0.7065546,
    contactLoss: 0.2575085,
    repairLoss: 0.15719867,
    lesionAgreement: 0.9716797,
    validationWindows: 4096,
  },
  ablations: {
    lesion30Agreement: 0.9765625,
    contiguousLesion30Agreement: 0.9765625,
    phaseRemovedAgreement: 1,
    phaseScrambledAgreement: 1,
    immuneRemovedAgreement: 1,
  },
  inferenceP95Milliseconds: 31.722332,
} as const;

const candidate = {
  checkpointSha256: 'bc0de2eaab420c0196cbe3a6cecc8e8f667367b2d4b3b009844f60221977c051',
  offlineMetrics: {
    totalLoss: 2.2753565,
    policyLoss: 1.7505045,
    policyAccuracy: 0.5854187,
    predictionLoss: 0.009928838,
    opponentLoss: 2.494946,
    valueLoss: 0.38852793,
    dangerLoss: 0.53872675,
    contactLoss: 0.2769812,
    repairLoss: 0.003187394,
    lesionAgreement: 0.9926758,
    validationWindows: 4096,
  },
  ablations: {
    lesion30Agreement: 0.953125,
    contiguousLesion30Agreement: 0.953125,
    phaseRemovedAgreement: 1,
    phaseScrambledAgreement: 1,
    immuneRemovedAgreement: 1,
  },
  inferenceP50Milliseconds: 18.487167,
  inferenceP95Milliseconds: 19.016756,
  deadline30HzPassed: true,
} as const;

const summary = {
  schemaVersion: 1,
  runId: 'balanced-v5-predrepair-r6',
  decision: 'promoted',
  promotedAt: '2026-08-21T01:04:25Z',
  incumbent,
  candidate,
  deltas: {
    totalLossPercent: -22.5665589291,
    policyAccuracyPercentagePoints: 4.26636,
    policyLossPercent: -25.383490787,
    predictionLossPercent: -36.2067144348,
    opponentLossPercent: -15.3425203786,
    dangerLossPercent: -23.7529909224,
    contactLossPercent: 7.561963974,
    repairLossPercent: -97.9723785195,
    lesion30PercentagePoints: -2.34375,
    contiguousLesion30PercentagePoints: -2.34375,
    inferenceP95Milliseconds: -12.705576,
  },
  promotionGates: {
    compositeImproved: true,
    accuracyRegressionAtMostOnePoint: true,
    predictionAtMostIncumbentTimes1_15: true,
    lesionAgreementAtLeast0_65: true,
    inferenceP95Below33_333Milliseconds: true,
  },
  adverseResults: [
    'contact loss increased 7.56%',
    'random and contiguous 30% lesion agreement each decreased 2.34 percentage points',
    'immediate phase and immune removal did not change the sampled first action',
  ],
} as const;

export function GET() {
  return Response.json(summary, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
