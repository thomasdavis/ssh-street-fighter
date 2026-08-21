const index = {
  schemaVersion: 1,
  generatedAt: '2026-08-21T05:35:00Z',
  project: 'TISSUE-0',
  status: 'promoted',
  latest: {
    runId: 'balanced-v5-immune-r8a',
    report: '/reports',
    manifest: '/reports/experiments/balanced-v5-immune-r8a/manifest.json',
    summary: '/reports/experiments/balanced-v5-immune-r8a/summary.json',
  },
  experiments: [
    {
      runId: 'balanced-v5-immune-r8a',
      decision: 'promoted; mechanism-strengthening hypothesis not supported',
      checkpointSha256: 'e67bc07d6bad2548f7bbf01b683faa99f0dfcd16ff0861b88ee656a23b6bf06a',
    },
    {
      runId: 'balanced-v5-danger-r7a',
      decision: 'promoted',
      checkpointSha256: '15ee8b7b9fa7de44351879b8616b80dc934ab781b15b46d48010537e12c3d1b0',
    },
    {
      runId: 'balanced-v5-predrepair-r6',
      decision: 'promoted',
      checkpointSha256: 'bc0de2eaab420c0196cbe3a6cecc8e8f667367b2d4b3b009844f60221977c051',
    },
    {
      runId: 'balanced-v5-maturation-r4-lowrate',
      decision: 'rejected: prediction loss exceeded the incumbent by 21.28%',
      checkpointSha256: 'ae70bd2e9da631050f18720768352373b6ce12aa5c7aee9751f9806b3dac821c',
    },
    {
      runId: 'balanced-v5-maturation-r5-ultralow',
      decision: 'rejected before external evaluation: internal prediction and policy metrics regressed',
      checkpointSha256: '8cbbc97f104b8c1609e3d3260387afca337868d07d8d4340b65b283285c3fd14',
    },
  ],
} as const;

export function GET() {
  return Response.json(index, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
