const manifest = {
  schemaVersion: 1,
  runId: 'balanced-v5-predrepair-r6',
  architecture: 'TISSUE-0-full-haskell',
  parameterCount: 5541093,
  source: {
    repository: 'thomasdavis/sf-tissue-bot',
    baseCommit: '388f10390e91714be27bd0861b74da8287b86f32',
    dirty: true,
    changedFileSha256: {
      'app/Main.hs': '16289610244bb8dd2ef34a99b3c1ec8e54b04daf63e5698dc76d4e540d05750d',
      'src/Tissue/Train.hs': '73915cd1008855e139f28017fda689dd599310dd1533bb8fedf323edbf4dad57',
    },
    executableSha256: 'c067e096913152cfd5d93867fedf43cb36d883d2549c9ca8af1e33894beb69e4',
  },
  engine: {
    version: 'sf-6',
    commit: 'a3d35dbbbe18e7c566d32dab013ddc41f42700e6+dirty',
    contractSha256: 'e66621deb9f8f9da04dd833695ddf6a8a2579ff9c0dee57d853192068043a862',
  },
  dataset: {
    name: 'fresh-balanced-v5.jsonl.gz',
    sha256: 'f571f7e0f6df980144e4104e01e55904ece81b835ef39cf8ffe4382a83cc2256',
    matches: 612,
    episodes: 1224,
    fighters: 17,
    opponentStyles: 9,
    split: 'deterministic 90/10 by match ID; paired perspectives remain together',
  },
  parentCheckpoint: {
    name: 'balanced-v5-maturation-r4-lowrate',
    sha256: 'ae70bd2e9da631050f18720768352373b6ce12aa5c7aee9751f9806b3dac821c',
  },
  training: {
    method: 'prediction-head-only AdamW; all other genome parameters frozen',
    windows: 2048,
    sequenceLength: 8,
    transitions: 16384,
    batchSize: 32,
    epochs: 1,
    learningRate: 0.00005,
    seed: 97,
  },
  evaluation: {
    windows: 4096,
    seed: 101,
    ablationSamples: 128,
    latencySamples: 24,
    candidateReportSha256: '7c4367cac188286f78d84460208befd56edcfea3a425cc24181ea97e550d8fee',
    incumbentReportSha256: '0be50a7205f632d9c2767519869815531be5fb78aeff2eb3557d38e7ec28b7a2',
  },
  hardware: {
    provider: 'RunPod Secure Cloud',
    region: 'EU-SE-1',
    accelerator: 'NVIDIA A40',
    acceleratorMemoryMiB: 46068,
    driver: '550.127.08',
    libtorch: '2.9.1+cu128',
  },
  checkpoint: {
    epoch: 9,
    cumulativeTransitions: 1327104,
    sha256: 'bc0de2eaab420c0196cbe3a6cecc8e8f667367b2d4b3b009844f60221977c051',
  },
} as const;

export function GET() {
  return Response.json(manifest, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
