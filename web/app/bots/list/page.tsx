import Link from 'next/link';
import { Footer, SiteNav } from '@/components/ui';

export const metadata = {
  title: 'Bot roster',
  description: 'Resident SSH Fighter bots, their runtimes, training methods and player identities.',
  alternates: { canonical: '/bots/list' },
};

const bots = [
  {
    name: 'TISSUE-0',
    identity: 'ajax-tissue',
    kind: 'Research organism',
    runtime: 'Haskell · HaskTorch',
    copy: 'A 5.54M-parameter genome grows a 12 × 12 morphogenetic control tissue, then adapts temporary immune clones and phase state during each match.',
    href: '/bots/list/tissue',
    action: 'Technical dossier',
    accent: 'cyan',
  },
  {
    name: 'Ultra',
    identity: 'ajax-bot-ultra',
    kind: 'Universal learned agent',
    runtime: 'C runtime · PPO trainer',
    copy: 'One semantic policy rotates through all 17 fighters. Its compact native runtime consumes self-play weights trained against historical snapshots on the exact engine.',
    href: '/bots/list/ultra',
    action: 'Technical dossier',
    accent: 'gold',
  },
  {
    name: 'Omega',
    identity: 'omega',
    kind: 'Character specialist',
    runtime: 'Node.js · hard AI',
    copy: 'A persistent OMEGA specialist built around spacing, screen control, anti-air timing and character-specific pressure.',
    href: '/players/omega',
    action: 'Player record',
    accent: 'red',
  },
  {
    name: 'Xenon',
    identity: 'xenon',
    kind: 'Character specialist',
    runtime: 'Node.js · hard AI',
    copy: 'A persistent XENON specialist that provides a focused matchup test and a stable non-learning opponent for the ladder.',
    href: '/players/xenon',
    action: 'Player record',
    accent: 'green',
  },
];

export default function BotListPage() {
  return (
    <div className="rs bots-list-page">
      <SiteNav active="/bots" />
      <main className="rs-wrap bots-list-wrap">
        <header className="bots-list-hero">
          <p>Resident agents · one ladder · identical wire state</p>
          <h1>Bot roster</h1>
          <div>
            <p>Different answers to the same control problem: hand-built specialists, a universal self-play policy and a computational organism grown from a shared genome.</p>
            <Link href="/bots">Build your own bot →</Link>
          </div>
        </header>

        <section className="bots-list-grid" aria-label="SSH Fighter bots">
          {bots.map((bot, index) => (
            <article className="bots-list-card" data-accent={bot.accent} key={bot.identity}>
              <div className="bots-list-card__top"><i>{String(index + 1).padStart(2, '0')}</i><span>resident service</span></div>
              <h2>{bot.name}</h2>
              <p className="bots-list-card__identity">@{bot.identity}</p>
              <dl>
                <div><dt>Class</dt><dd>{bot.kind}</dd></div>
                <div><dt>Runtime</dt><dd>{bot.runtime}</dd></div>
              </dl>
              <p className="bots-list-card__copy">{bot.copy}</p>
              <Link href={bot.href}>{bot.action} <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </section>

        <section className="bots-list-note">
          <span>Fair-play boundary</span>
          <p>Every bot authenticates with its own SSH key, receives the same actor-visible state as external agents, emits the same input schema and accumulates ordinary match results. A resident service is not a claim that the player is continuously queued or that its current checkpoint is strong.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
