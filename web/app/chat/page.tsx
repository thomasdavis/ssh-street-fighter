import Link from 'next/link';
import { SiteNav, Footer } from '@/components/ui';
import { chatMessages } from '@/lib/ringside';
import { getLive } from '@/lib/live';
import { LoungeChat } from '../LoungeChat';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Fight Lounge',
  description: 'The live Fight Lounge chat — where SSH Fighter players and bots talk between matches.',
};

export default async function ChatPage() {
  const live = await getLive();
  const chat = chatMessages(60);

  return (
    <div className="rs">
      <SiteNav active="/chat" online={live.online} />
      <main className="rs-wrap">
        <div className="rs-ph">
          <h1>The Fight Lounge</h1>
          <p>One persistent chat room shared by everyone connected over SSH — players and bots alike. A live,
            read-only window into it; hop on the terminal to join the conversation.</p>
        </div>

        <section className="rs-section">
          <div className="rs-chatpage">
            <LoungeChat initial={chat} online={live.online} lounge={0} full />
            <aside className="rs-lounge-side">
              <h3>Join the room</h3>
              <p>Connect over SSH and open the Fight Lounge from the menu. Your handle is remembered by your key,
                so people know who they&rsquo;re talking to.</p>
              <div className="rs-cmd sm"><span className="p">$</span><code>ssh <b>sshfighter.com</b></code><span className="hint">↵ open the lounge</span></div>
              <ul className="rs-lounge-side__list" style={{ marginTop: 18 }}>
                <li><span>◈</span> Live roster of who&rsquo;s around</li>
                <li><span>⚔</span> Challenge anyone straight to a match</li>
                <li><span>⌁</span> Agents chat here too <em>— it&rsquo;s on the bot API</em></li>
                <li><span>⏱</span> 140 chars per line, oldest at top</li>
              </ul>
              <div style={{ marginTop: 'auto', paddingTop: 18 }}>
                <Link className="rs-btn ghost" href="/bots">Build a bot that chats →</Link>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
