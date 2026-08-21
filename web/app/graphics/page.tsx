import { Footer, SiteNav } from '@/components/ui';
import { SpriteLoop } from '@/components/SpriteLoop';
import { onlineNow } from '@/lib/ringside';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'How the terminal graphics work',
  description: 'How SSH Fighter turns a truecolor pixel framebuffer into compact Unicode cells, ANSI diffs, and smooth animation over an ordinary SSH connection.',
  path: '/graphics',
  imageAlt: 'SSH Fighter rendering hand-drawn pixel art inside a terminal over SSH',
});

const PIPELINE = [
  ['30 Hz', 'game state'],
  ['RGB', 'pixel grid'],
  ['2×4', 'cell fit'],
  ['ANSI', 'frame diff'],
  ['SSH', 'your screen'],
] as const;

// Renderer-valid octant mask 0x5A: bits 1, 3, 4 and 6 become the foreground.
const OCTANT_PIXELS = ['night', 'gold', 'night', 'gold', 'gold', 'night', 'gold', 'night'] as const;

function PixelCell() {
  return (
    <div className="gfx-cell" aria-hidden="true">
      <div className="gfx-cell__pixels">
        {OCTANT_PIXELS.map((tone, index) => <i key={index} className={tone} />)}
      </div>
      <span className="gfx-cell__arrow">→</span>
      <div className="gfx-cell__glyph">▞</div>
      <div className="gfx-cell__labels">
        <span>foreground</span>
        <span>background</span>
      </div>
    </div>
  );
}

function DiffStrip() {
  return (
    <div className="gfx-diff" aria-label="Only changed terminal cells are transmitted">
      <div className="gfx-diff__frame" aria-hidden="true">
        {Array.from({ length: 36 }, (_, index) => (
          <i key={index} className={index === 16 || index === 17 || index === 22 || index === 23 ? 'changed' : ''} />
        ))}
      </div>
      <div className="gfx-diff__payload">
        <span>sent</span>
        <code>ESC[3;5H … 4 cells</code>
      </div>
    </div>
  );
}

export default function GraphicsPage() {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'How SSH Fighter graphics work',
    description: 'The rendering pipeline behind SSH Fighter, from deterministic game state to truecolor Unicode cells streamed over SSH.',
    url: 'https://sshfighter.com/graphics',
    author: { '@type': 'Person', name: 'Thomas Davis', url: 'https://ajaxdavis.dev' },
    publisher: { '@type': 'Organization', name: 'SSH Fighter', url: 'https://sshfighter.com' },
  };

  return (
    <div className="rs gfx-page" data-impeccable-form="graphics-read-existing-world-v1">
      <SiteNav active="/graphics" online={onlineNow()} />
      <main>
        <section className="gfx-hero">
          <div className="rs-wrap gfx-hero__in">
            <div className="gfx-hero__copy">
              <h1>Pixels,<br />packed into text.</h1>
              <p>SSH Fighter draws a real RGB scene on the server, compresses it into Unicode block cells, then streams only what changed. Your terminal is the screen.</p>
              <a className="gfx-jump" href="#pipeline">See the whole pipeline <span aria-hidden="true">↓</span></a>
            </div>

            <div className="gfx-hero__machine" aria-label="A live SSH Fighter scene becoming terminal cells">
              <div className="gfx-scene">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="gfx-scene__stage" src="/api/stage/monsoon" alt="Monsoon Palace arena rendered by SSH Fighter" />
                <SpriteLoop char="XENON" poses={['idle_1', 'idle_2']} ms={460} className="gfx-scene__fighter a" />
                <SpriteLoop char="AJAX" poses={['idle_1', 'idle_2']} ms={520} className="gfx-scene__fighter b" />
                <div className="gfx-scene__scan" aria-hidden="true" />
              </div>
              <div className="gfx-terminal-readout" aria-hidden="true">
                <span>240 × 160 RGBA</span>
                <strong>→</strong>
                <span>▖▜▙▘ ANSI TRUECOLOR</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rs-wrap gfx-pipeline" id="pipeline" aria-labelledby="pipeline-title">
          <h2 id="pipeline-title">One frame, end to end</h2>
          <div className="gfx-pipeline__rail">
            {PIPELINE.map(([value, label], index) => (
              <div key={label} className="gfx-pipeline__stop">
                <b>{value}</b><span>{label}</span>
                {index < PIPELINE.length - 1 && <i aria-hidden="true" />}
              </div>
            ))}
          </div>
        </section>

        <div className="rs-wrap gfx-explainer">
          <section className="gfx-chapter gfx-chapter--scene">
            <div className="gfx-chapter__copy">
              <h2>First, draw a real image.</h2>
              <p>Combat state becomes one 24-bit RGB pixel grid: packed arena art, area-scaled fighter sprites, projectiles, hit sparks, weather and a tiny pixel-font HUD. The logical canvas is always <strong>two pixels wide by four pixels tall for every terminal cell</strong>.</p>
            </div>
            <dl className="gfx-facts">
              <div><dt>Simulation</dt><dd>30 Hz</dd></div>
              <div><dt>Visual output</dt><dd>up to 15 Hz</dd></div>
              <div><dt>Arena motifs</dt><dd>7.5 Hz</dd></div>
            </dl>
          </section>

          <section className="gfx-chapter gfx-chapter--fit">
            <PixelCell />
            <div className="gfx-chapter__copy">
              <h2>Then, fit pixels to glyphs.</h2>
              <p>For each 2×4 block, the renderer splits pixels by brightness, averages two truecolor groups, and chooses the block glyph whose shape matches the eight-bit pattern.</p>
              <div className="gfx-modes" aria-label="Available terminal rendering modes">
                <span><b>Quadrant</b> universal default</span>
                <span><b>Octant</b> eight sub-pixels</span>
                <span><b>Half</b> safest fallback</span>
              </div>
            </div>
          </section>

          <section className="gfx-color" aria-labelledby="color-title">
            <div>
              <h2 id="color-title">Color survives the trip.</h2>
              <p>Each glyph carries independent 24-bit foreground and background colors. There is no forced web palette and no sixel dependency.</p>
            </div>
            <code><span>38;2</span>;245;217;74&nbsp;&nbsp;<span>48;2</span>;9;6;15&nbsp;&nbsp;▞</code>
          </section>

          <section className="gfx-chapter gfx-chapter--diff">
            <div className="gfx-chapter__copy">
              <h2>Only the motion travels.</h2>
              <p>Two cell buffers are compared every render. Unchanged scenery costs nothing; changed runs get one cursor move and only the ANSI color channels they need. SSH compression handles the rest.</p>
            </div>
            <DiffStrip />
          </section>

          <section className="gfx-resilience" aria-labelledby="resilience-title">
            <div className="gfx-resilience__title">
              <h2 id="resilience-title">Smooth by refusing stale work.</h2>
              <p>A slow connection never builds a queue of obsolete animation frames.</p>
            </div>
            <ol>
              <li><b>Write blocks</b><span>Pause visual output.</span></li>
              <li><b>Game continues</b><span>Inputs and the 30 Hz simulation keep moving.</span></li>
              <li><b>Stream drains</b><span>Diff from the newest frame—not the backlog.</span></li>
            </ol>
            <p className="gfx-resilience__cap">Render work is capped at a 900×360 terminal, scales down on unusually large screens, and can move to a bounded worker pool.</p>
          </section>

          <section className="gfx-chapter gfx-chapter--upgrade">
            <div className="gfx-upgrade__visual" aria-hidden="true">
              <span className="gfx-upgrade__cell">▖▜</span>
              <i>V</i>
              <span className="gfx-upgrade__rgb">RGB</span>
            </div>
            <div className="gfx-chapter__copy">
              <h2>Modern terminals get more. Nobody gets locked out.</h2>
              <p>With capability probing enabled, Kitty, Ghostty, WezTerm and other compatible terminals can show zlib-compressed true-pixel images on mostly static screens. Fights stay on the lighter cell-diff renderer. Unsupported replies are stripped and the universal path keeps working.</p>
            </div>
          </section>

          <section className="gfx-close">
            <div>
              <h2>The trick is not one trick.</h2>
              <p>Original art, a deterministic pixel canvas, smart glyph fitting, exact diffs and strict backpressure make the terminal feel like an arcade cabinet.</p>
            </div>
            <div className="gfx-close__actions">
              <code><span>$</span> ssh sshfighter.com</code>
              <a href="https://github.com/thomasdavis/sshfighter.com/tree/main/src/render" target="_blank" rel="noreferrer">Read the renderer source ↗</a>
            </div>
          </section>
        </div>
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
    </div>
  );
}
