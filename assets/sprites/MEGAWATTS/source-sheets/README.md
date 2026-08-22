# MEGAWATTS sprite sources

These three 4×3 atlases are the lossless chroma-key sources for the packed runtime sprites in the parent directory. They were generated with the repository concept art as the identity reference and the existing XENON source sprite as the rendering/background reference.

- `01-movement.png` — idle, walk, crouch, jump/fall, guards, hit, KO, menu. SHA-256 `7a4511d07e5eb334ac2c8d458d7786253199a8a61298d1cc2d314e17e082f09b`.
- `02-combat.png` — standing/crouching normals, jump kick, throw sequence. SHA-256 `598b77fb2724d7f661c9459698a731f23811e4f8e5d64f16076618ea96eb2805`.
- `03-specials.png` — thrown states, victories, Citation Bolt, Bombs of Knowledge, Ground Truth. SHA-256 `bcb70e26160106d6fcb4d0b7fe3fc0fb59d1f92357814b501465bfef56bd4d38`.

All prompts fixed the character identity to the MEGAWATTS concept, requested clean 1990s arcade cel art in side view facing right, specified the cell-by-cell pose order, and required a flat uniform pure `#FF00FF` background with no labels, dividers, ground, shadows, UI, logos, or watermark. Special prompts additionally fixed the hot-gold/blue-violet electrical language and faceted polyhedral knowledge cores.

Repack without generating new art:

```sh
node --import tsx src/tools/import-megawatts-sheets.ts
```

The importer also writes runtime aliases: `citation` becomes `hadouken`, and
`groundtruth` becomes both `electric_1` and `electric_2`. Those aliases reflect
the reused engine primitives; only `knowledgebomb_1/2` belongs to the new
`bombardment` attack kind.
