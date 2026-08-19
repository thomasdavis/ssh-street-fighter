import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fighterSlugs, getFighterProfile } from '@/lib/fighters';
import { listPoses, spriteMtime } from '@/lib/sprites';
import AnimatedSprite from './AnimatedSprite';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return fighterSlugs().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = getFighterProfile(id);
  if (!profile) return { title: 'Fighter not found — SSH Fighter' };
  return {
    title: `${profile.character.name} — ${profile.character.tagline} | SSH Fighter`,
    description: `${profile.character.name} fighter guide: background story, animated sprites, special-move inputs, damage, frame data, and tactics.`,
  };
}

export default async function FighterPage({ params }: PageProps) {
  const { id } = await params;
  const profile = getFighterProfile(id);
  if (!profile) notFound();
  const { character } = profile;
  const style = { '--fighter-accent': profile.accent } as CSSProperties;
  const poses = listPoses(character.name);

  return (
    <main className="fighter-page" style={style}>
      <nav className="site-nav" aria-label="Site navigation">
        <Link className="site-mark" href="/">SSH FIGHTER</Link>
        <span><Link href="/fighters" style={{ color: 'inherit', textDecoration: 'none' }}>← Roster</Link> · Fighter {String(profile.number).padStart(2, '0')} / {String(fighterSlugs().length).padStart(2, '0')}</span>
      </nav>

      <section className="fighter-hero" aria-labelledby="fighter-name">
        <div className="fighter-hero__copy">
          <p className="eyebrow">{character.archetype} · {character.difficulty}</p>
          <h1 id="fighter-name">{character.name}</h1>
          <p className="fighter-tagline">{character.tagline}</p>
          <blockquote>“{character.quote}”</blockquote>
          <dl className="fighter-facts">
            <div><dt>Origin</dt><dd>{character.origin}</dd></div>
            <div><dt>Discipline</dt><dd>{character.discipline}</dd></div>
            <div><dt>Combat role</dt><dd>{character.archetype}</dd></div>
            <div><dt>Learning curve</dt><dd>{character.difficulty}</dd></div>
          </dl>
        </div>
        <div className="fighter-hero__sprite">
          <span className="sprite-callout">LIVE SPRITE // IDLE</span>
          <AnimatedSprite character={character.name} frames={profile.idleFrames} label={`${character.name} idle stance`} priority />
        </div>
      </section>

      <section className="fighter-overview" aria-labelledby="background-title">
        <div className="fighter-story">
          <p className="section-index">01 / BACKGROUND</p>
          <h2 id="background-title">Why {character.name} fights</h2>
          {character.story.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <aside className="combat-brief" aria-labelledby="brief-title">
          <p className="section-index">FIELD NOTES</p>
          <h2 id="brief-title">How to play</h2>
          <p>{character.playstyle}</p>
          <ul>{character.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul>
        </aside>
      </section>

      <section className="move-list" aria-labelledby="attacks-title">
        <div className="section-heading">
          <div>
            <p className="section-index">02 / SPECIAL ATTACKS</p>
            <h2 id="attacks-title">Signature techniques</h2>
          </div>
          <p>Inputs assume the fighter faces right. W = punch · E = kick.</p>
        </div>

        {profile.moves.map(({ move, input, stats, frames }, index) => (
          <article className="move-dossier" key={move.name}>
            <div className="move-dossier__visual">
              <AnimatedSprite character={character.name} frames={frames} label={`${character.name} performing ${move.name}`} compact />
            </div>
            <div className="move-dossier__copy">
              <span className="move-number">0{index + 1}</span>
              <p className="move-impact">{stats.impact}</p>
              <h3>{move.name}</h3>
              <kbd>{input}</kbd>
              <p>{move.description}</p>
            </div>
            <dl className="move-stats" aria-label={`${move.name} combat statistics`}>
              <div><dt>Damage</dt><dd>{stats.maxHits > 1 ? `${stats.damagePerHit} × ${stats.maxHits}` : stats.maxDamage}<small>{stats.maxHits > 1 ? `${stats.maxDamage} max` : 'on hit'}</small></dd></div>
              <div><dt>Startup</dt><dd>{stats.startup}<small>frames</small></dd></div>
              <div><dt>Active</dt><dd>{stats.active}<small>frames</small></dd></div>
              <div><dt>Recovery</dt><dd>{stats.recovery}<small>frames</small></dd></div>
              <div><dt>Chip</dt><dd>{stats.chipPerHit}<small>per hit</small></dd></div>
              <div><dt>Reach</dt><dd>{stats.range}<small>world units</small></dd></div>
            </dl>
          </article>
        ))}
      </section>

      {poses.length > 0 && (
        <section className="move-list" aria-labelledby="sprites-title" style={{ paddingTop: 40 }}>
          <div className="section-heading">
            <div>
              <p className="section-index">03 / SPRITE SHEET</p>
              <h2 id="sprites-title">Every frame of {character.name}</h2>
            </div>
            <p>{poses.length} hand-drawn poses — the same sprites the terminal renders.</p>
          </div>
          <div className="pose-gallery">
            {poses.map((pose) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="pose-cell" key={pose}>
                <img src={`/api/sprite/${encodeURIComponent(character.name)}/${pose}?v=${spriteMtime(character.name, pose)}`} alt={`${character.name} ${pose}`} loading="lazy" />
                <span>{pose.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="fighter-switcher" aria-label="Browse fighters">
        <Link href={`/fighters/${profile.previous.slug}`}><span>Previous fighter</span>← {profile.previous.name}</Link>
        <Link href="/fighters">All fighters</Link>
        <Link href={`/fighters/${profile.next.slug}`}><span>Next fighter</span>{profile.next.name} →</Link>
      </nav>
    </main>
  );
}
