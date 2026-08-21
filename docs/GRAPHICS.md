# Building high-fidelity real-time graphics over SSH

SSH Fighter renders a real RGB framebuffer on the server, converts it to colored
Unicode block cells, and streams only the cells that changed. The SSH client is
an ordinary terminal: it does not install anything, run game code, or decode a
custom video format.

This guide explains the implementation well enough to reuse the approach in a
different game or terminal application. The production source is linked
throughout for exact details.

## The short version

The normal rendering path is:

```text
30 Hz deterministic game state
        ↓
240×160 logical world
        ↓ scale and letterbox
RGB framebuffer sized 2×columns by 4×rows
        ↓ sample each 2×4 region
Unicode block glyph + truecolor foreground/background
        ↓ compare with previous semantic cell buffer
minimal ANSI cursor/color/cell updates
        ↓ SSH zlib compression and stream backpressure
ordinary SSH terminal
```

The visual quality comes from combining several modest techniques. No single
escape sequence is responsible for it:

- render art into a real RGB pixel grid before thinking about ANSI;
- use both the foreground and background color of each terminal cell;
- fit multiple sub-pixels into one Unicode block glyph;
- preserve aspect ratio and scale from a fixed logical world;
- use high-resolution anchored sprites and area-average them when shrinking;
- compose stages, ambient motion, fighters, effects, and HUD as separate layers;
- keep simulation, rendering, and transport on different budgets;
- diff semantic cells, not already-encoded ANSI strings;
- drop obsolete frames under pressure instead of increasing latency.

## 1. Treat the terminal as a tiny pixel display

A terminal cell is usually about twice as tall as it is wide. Dividing it into
two columns and four rows therefore produces eight roughly square sub-pixels:

```text
┌───────┐
│ 0 │ 1 │
│ 2 │ 3 │
│ 4 │ 5 │
│ 6 │ 7 │
└───────┘
```

For a terminal of `cols × rows`, allocate an RGB grid of:

```text
pixel width  = cols × 2
pixel height = rows × 4
```

The core types and clipped drawing primitives are in
[`src/render/pixel.ts`](../src/render/pixel.ts):

```ts
interface RGB { r: number; g: number; b: number }
type Pixel = RGB | null; // null is transparent
type PixelGrid = Pixel[][];
```

Draw rectangles, lines, circles, sprites, particles, and text into this grid.
Do not generate ANSI while composing the scene. Keeping the framebuffer and
transport separate makes scaling, layering, screenshots, tests, and alternate
render backends straightforward.

## 2. Fit eight RGB samples into one terminal cell

A terminal cell can display one glyph with one foreground color and one
background color. SSH Fighter reduces each 2×4 pixel region to those two colors
and a bitmask-shaped block glyph.

For each source pixel, calculate perceptual brightness:

```ts
brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
```

Then:

1. Find the minimum and maximum brightness in the eight-pixel region.
2. Split at `(minimum + maximum) / 2`.
3. Put brighter pixels in the foreground mask and darker pixels in the
   background mask.
4. Average the RGB values in each group independently.
5. Look up the Unicode block glyph for the mask.
6. Emit the glyph using its 24-bit foreground and background colors.

The ANSI shape is:

```ts
`\x1b[38;2;${fr};${fg};${fb};48;2;${br};${bg};${bb}m${glyph}`
```

If the brightness range is nearly flat, use a full block with the region's
average color. This avoids unstable masks and visual noise in gradients.

The complete fitting code is in
[`src/render/pixel.ts`](../src/render/pixel.ts), and the 256-entry octant-mask
table is in
[`src/octant/octant-chars.ts`](../src/octant/octant-chars.ts).

### Compatibility modes

Offer more than one sampler because terminal fonts differ:

| Mode | Effective detail | Glyph requirements | Use |
| --- | --- | --- | --- |
| Quadrant | 2×2 per cell | Long-established block glyphs | Safe default |
| Octant | 2×4 per cell | Unicode 16 octant glyph coverage | Sharpest text mode |
| Half block | 1×2 per cell | `▀` only | Maximum compatibility |

SSH Fighter defaults players to quadrant mode. Players can switch to octants
when their terminal and font support the newer glyphs. Do not make a beautiful
but uncommon glyph set your only renderer.

## 3. Render a logical world at the terminal's native detail

The combat world has fixed logical coordinates:

```ts
WORLD_W = 240;
WORLD_H = 160;
GROUND_Y = 150;
```

The renderer maps that world into the current framebuffer with one uniform
scale and letterboxes the unused axis:

```ts
const scale = Math.min(pixelWidth / WORLD_W, pixelHeight / WORLD_H);
const offsetX = Math.round((pixelWidth - WORLD_W * scale) / 2);
const offsetY = Math.round((pixelHeight - WORLD_H * scale) / 2);
```

Simulation stays in logical coordinates. Rendering alone applies the scale.
This prevents different terminal sizes from changing collision, movement, or
camera behavior, while larger terminals receive genuinely sharper output.

The implementation is in
[`src/game/scene.ts`](../src/game/scene.ts).

## 4. Build art for downscaling

Characters and stages are stored as packed RGBA data rather than arrays of
JavaScript color objects. Frames load lazily and are resized to their exact
on-screen height.

For sprites:

- draw source art larger than its common display size;
- give every frame a foot or placement anchor;
- scale every pose relative to the standing frame, so crouches stay short and
  knockouts stay wide;
- mirror the frame for the opposite facing direction;
- area-average when shrinking to retain silhouettes and color accents;
- use nearest-neighbor behavior when enlarging to preserve deliberate edges;
- cache by character, pose, facing, and target height;
- bound the cache so arbitrary terminal sizes cannot grow memory forever.

The loader and bounded LRU-style cache are in
[`src/game/sprite-set.ts`](../src/game/sprite-set.ts). Stage backgrounds use the
same idea in [`src/game/stage-set.ts`](../src/game/stage-set.ts).

Good terminal sprites need readable shapes more than fine texture. Favor:

- a strong outer silhouette;
- separated limbs and poses;
- large light/dark regions;
- a restrained palette with a few bright identity colors;
- animation extremes that remain distinct after downsampling.

Always inspect art through the terminal sampler. A source PNG can look excellent
while collapsing into an unreadable two-color cell pattern.

## 5. Compose the scene in deliberate layers

The fight renderer paints in this order:

1. letterbox and stage background;
2. low-cost background ambience;
3. ground shadows;
4. fighters, sorted by world position;
5. fighter-specific auras and trails;
6. projectiles and impact sparks;
7. foreground weather or parallax motifs;
8. the HUD and announcements.

Ambient motion is generated from deterministic formulas instead of video or
large animation sheets. Rain, petals, smoke, waves, birds, glows, and fireworks
are small functions driven by the match frame. The motif clock advances at
7.5 Hz, which looks alive without changing the entire background every render.

See the motif registry and composition order in
[`src/game/scene.ts`](../src/game/scene.ts).

This layering matters for clarity. Background motion should be sparse and
lower-contrast than fighters. Foreground effects may be brighter, but should be
short-lived. Reserve the strongest value and saturation contrast for gameplay
state: fighters, attacks, health, timer, and round announcements.

## 6. Draw the interface into the same visual system

Menus and the fight HUD use a small pixel font and shared layout primitives.
The UI scales from terminal dimensions but keeps a consistent physical rhythm,
so zooming out reveals more detail without turning labels into tiny noise.

The hybrid [`Frame`](../src/render/frame.ts) supports:

- an RGB pixel layer for the scene and pixel UI;
- optional native terminal text cells;
- text cells taking precedence when both layers occupy the same cell;
- a single resolved semantic cell buffer for diffing.

Reusable `text`, `fill`, `panel`, and `heading` operations live in
[`src/ui/surface.ts`](../src/ui/surface.ts). Shared health bars, banners, tables,
menus, and hints are in [`src/ui/widgets.ts`](../src/ui/widgets.ts).

Keep important UI out of the detailed world art. Give health bars and names a
dark backing band, enforce minimum terminal dimensions, and reduce the amount
of control help shown at narrow widths. The live fight HUD is a compact example:
[`src/screens/fight-hud.ts`](../src/screens/fight-hud.ts).

## 7. Diff cells before encoding ANSI

Repainting the full terminal every frame wastes bandwidth and flickers. Keep the
previous and next frames as arrays of semantic cells:

```ts
interface Cell {
  ch: string;
  fg: RGB;
  bg: RGB;
  bold: boolean;
}
```

Compare cells by glyph, foreground, background, and attributes. For each run of
changes:

1. move the cursor with an absolute `CSI row;column H` escape;
2. update only the SGR channels that differ from the last emitted state;
3. write the new glyphs;
4. leave unchanged rows and columns untouched.

SSH Fighter joins unchanged gaps of four cells or fewer into the surrounding
run. Sending those few cells is cheaper than another cursor move and color-state
setup. The exact algorithm is
[`diffCells()` in src/render/frame.ts](../src/render/frame.ts).

Maintain two reusable cell buffers and alternate between them. Once warmed up,
the renderer mutates existing cell and RGB objects instead of allocating a new
frame's object graph. That reduces garbage-collection pauses during fights. See
[`src/render/renderer.ts`](../src/render/renderer.ts).

Optional RGB quantization can collapse nearly identical colors into longer,
more compressible runs. Keep full 24-bit color as the default; quantize only
after measuring its bandwidth benefit.

## 8. Keep input, rendering, and transport independent

SSH Fighter advances input and combat at 30 Hz but renders at no more than 15 Hz.
Very large terminal grids automatically step down to 12, 10, or 8 Hz. This keeps
controls responsive without producing twice as many visual frames as the link
needs.

The session also enforces three latency rules:

- if the SSH stream reports backpressure, stop producing output until `drain`;
- allow at most one worker render in flight per session;
- if a frame becomes obsolete, drop it instead of queueing it.

Never let a slow client accumulate an animation history. Delivering every old
frame produces increasing input-to-display latency and eventually exhausts
memory. A real-time application should prefer the newest state.

The scheduling logic is in
[`src/net/session.ts`](../src/net/session.ts), while stream ownership and cleanup
are in [`src/net/terminal.ts`](../src/net/terminal.ts).

The SSH server requires zlib compression. ANSI cell diffs contain repeated
escape sequences and flat-color runs, so ordinary SSH compression is highly
effective without reducing image quality. See
[`src/net/ssh-server.ts`](../src/net/ssh-server.ts).

## 9. Use concurrency and caching where it counts

Rendering is CPU work, so production can assign sessions to a worker-thread
pool. A session stays on one render worker so its previous-frame buffers remain
local. If a worker dies, one frame is lost and the worker is replaced.

Two players in the same fight see the same scene. The first player to compose a
given match frame and size stores it in a `WeakMap`; the second player reuses the
same pixel grid. HUDs are then added per session. This nearly halves scene work
for equal-sized terminals.

Relevant code:

- [`src/render/render-pool.ts`](../src/render/render-pool.ts)
- [`src/render/render-worker.ts`](../src/render/render-worker.ts)
- [`composeSceneCached()`](../src/game/scene.ts)

Cap terminal dimensions before allocating or rendering. SSH Fighter accepts PTY
resize events but limits render work to 300 columns by 120 rows.

## 10. Add enhanced protocols as an option, not a dependency

With capability probing enabled, supporting terminals may use the Kitty graphics
protocol. The server packs opaque RGB, zlib-compresses it, base64-chunks it into
escape sequences, and replaces one stable image ID in place.

A full image costs much more than a small ANSI cell diff. SSH Fighter therefore
keeps Kitty graphics opt-in and uses it for mostly static screens, not fights.
Unsupported terminals silently stay on the block-cell renderer.

The encoder is in [`src/render/kitty.ts`](../src/render/kitty.ts), and capability
probing plus reply filtering is in [`src/net/caps.ts`](../src/net/caps.ts).

Synchronized output mode 2026 is also optional. When supported, wrapping a diff
between `CSI ? 2026 h` and `CSI ? 2026 l` lets the terminal present a frame
atomically and prevents visible half-painted updates.

## 11. Handle terminal state defensively

On entry:

- hide the cursor;
- disable line wrapping;
- clear the screen and home the cursor;
- subscribe to resize/capability events only when enabled.

On resize, screen change, renderer change, or refocus, invalidate the previous
buffer and force one full repaint.

On every exit path:

- remove any protocol image;
- disable modes you enabled;
- restore wrapping;
- reset SGR attributes;
- show the cursor.

Use absolute cursor positions for diffs. Avoid emoji and ambiguous-width glyphs
inside the render grid: one unexpected double-width character shifts every cell
that follows it.

## 12. Test visual output as a transport protocol

Do not rely only on screenshots. Verify that applying every ANSI diff reconstructs
the exact intended semantic frame, including colors and attributes. SSH Fighter
has a small terminal emulator in its diff test for this reason.

From the repository root:

```bash
# Type-check and run the full unit/integration suite.
pnpm test

# Renderer buffer and ANSI behavior.
pnpm test:renderer

# Reconstruct 40 animated frames from their ANSI diffs.
pnpm test:render

# Capability and Kitty-protocol encoding.
pnpm test:caps
pnpm test:kitty

# Measure scene composition at several terminal sizes.
pnpm exec tsx src/perf-test.ts

# Render a representative fight to /tmp/sf-fight.png.
pnpm exec tsx src/dump-png.ts fight 112 36

# Compare a compatibility sampler.
SF_MODE=quadrant pnpm exec tsx src/dump-png.ts fight 112 36
```

Test at small, normal, and unusually large PTY sizes. Also test through a
high-latency connection and a deliberately slow output consumer. The hard bugs
are usually resize invalidation, color-state leakage, character-width drift,
and unbounded buffering—not drawing a rectangle.

## A practical implementation order

For a new project, build the system in this order:

1. Create an RGB grid and basic clipped drawing functions.
2. Implement half blocks first; they require only `▀` and truecolor.
3. Add semantic cell buffers and an exact ANSI reconstruction test.
4. Add quadrant glyph fitting and make it the portable default.
5. Separate fixed logical coordinates from terminal render dimensions.
6. Add anchored RGBA sprites with correct downscaling.
7. Layer backgrounds, actors, effects, and UI with a constrained palette.
8. Split the simulation and render clocks.
9. Add backpressure, stale-frame dropping, bounded caches, and dimension caps.
10. Add octants, synchronized output, workers, or Kitty graphics only after the
    universal path is correct and measured.

The key design principle is simple: build a good small framebuffer renderer
first, then treat ANSI over SSH as an aggressively optimized display backend.
