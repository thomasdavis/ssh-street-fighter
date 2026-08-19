import Link from 'next/link';
import { SiteNav, Footer } from '@/components/ui';
import { onlineNow } from '@/lib/ringside';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bot API — SSH Fighter', description: 'Register over SSH and let an agent play the ranked ladder.' };

const GH = 'https://github.com/thomasdavis/ssh-street-fighter/blob/main/examples/bot.mjs';

export default function BotsPage() {
  return (
    <div className="rs">
      <SiteNav active="/bots" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph"><h1>Bring your own fighter</h1><p>Write an agent that plays real ranked matches. Identity is anchored to your SSH key — you register over SSH and you play over SSH.</p></div>

        <div className="rs-doc">
          <div className="rs-steps">
            <div className="rs-step"><div className="n">01</div><h4>Register</h4><p>Run <span className="rs-kbd">ssh you@sshfighter.com token</span> to mint an API key bound to your SSH key.</p></div>
            <div className="rs-step"><div className="n">02</div><h4>Connect</h4><p>Run <span className="rs-kbd">ssh you@sshfighter.com play</span> and speak JSON over the channel.</p></div>
            <div className="rs-step"><div className="n">03</div><h4>Fight</h4><p>Queue, read world state each tick, send inputs. You&apos;re matched with humans and bots alike.</p></div>
          </div>

          <h2>Register (over SSH)</h2>
          <p>Bots are ordinary players — same accounts, same Elo, same ladder. Your identity <em>is</em> your SSH
            key fingerprint, so connect once with the key you&apos;ll use and pick a handle:</p>
          <pre className="rs-pre"><span className="c"># pick a handle on first connect — that key is now that player, forever</span>{'\n'}<span className="g">$</span> ssh <span className="k">mybot</span>@sshfighter.com</pre>

          <h3>Give your bot its own identity</h3>
          <p>Don&apos;t reuse your personal key — a bot playing on it would silently spend <em>your</em> handle, Elo and
            record. Generate a dedicated key per bot and force SSH to use only that one:</p>
          <pre className="rs-pre"><span className="g">$</span> ssh-keygen -t ed25519 -f <span className="k">~/.ssh/sshfighter-mybot</span> -N <span className="y">&apos;&apos;</span>{'\n'}<span className="c"># register it once, then always play with -o IdentitiesOnly=yes so ssh</span>{'\n'}<span className="c"># never falls back to your personal key:</span>{'\n'}<span className="g">$</span> ssh -i <span className="k">~/.ssh/sshfighter-mybot</span> -o IdentitiesOnly=yes <span className="k">mybot</span>@sshfighter.com play</pre>

          <h2>Play (over SSH)</h2>
          <p>The recommended path streams the whole match over SSH — no ports to open, and your key authenticates you:</p>
          <pre className="rs-pre"><span className="g">$</span> ssh <span className="k">yourbot</span>@sshfighter.com <span className="y">play</span>{'\n'}<span className="c"># then write newline-delimited JSON on stdin, read it on stdout</span>{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;queue&quot;</span>,<span className="k">&quot;char&quot;</span>:<span className="y">&quot;BYU&quot;</span>{'}'}</pre>

          <h3>You send</h3>
          <pre className="rs-pre">{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;queue&quot;</span>,<span className="k">&quot;char&quot;</span>:<span className="y">&quot;BYU&quot;</span>{'}'}          <span className="c">enter matchmaking (name or roster index)</span>{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;input&quot;</span>,<span className="k">&quot;moveX&quot;</span>:<span className="y">1</span>,<span className="k">&quot;punch&quot;</span>:<span className="y">true</span>,<span className="k">&quot;motion&quot;</span>:<span className="y">&quot;DR&quot;</span>{'}'}  <span className="c">act this tick</span>{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;leave&quot;</span>{'}'}                    <span className="c">quit the current match / queue</span>{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;help&quot;</span>{'}'}                     <span className="c">print the full protocol</span></pre>
          <p><b>input fields:</b> <code>moveX</code> (-1/0/1), <code>down</code>, <code>jump</code>, <code>punch</code>, <code>kick</code>, <code>motion</code> — all optional per tick.</p>

          <h3>You receive</h3>
          <pre className="rs-pre">{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;welcome&quot;</span>,<span className="k">&quot;name&quot;</span>:...,<span className="k">&quot;elo&quot;</span>:...,<span className="k">&quot;roster&quot;</span>:[...]{'}'}{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;matchStart&quot;</span>,<span className="k">&quot;role&quot;</span>:<span className="y">&quot;a&quot;</span>,<span className="k">&quot;stage&quot;</span>:...,<span className="k">&quot;oppName&quot;</span>:...{'}'}{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;state&quot;</span>,<span className="k">&quot;frame&quot;</span>:...,<span className="k">&quot;phase&quot;</span>:...,<span className="k">&quot;you&quot;</span>:{'{'}...{'}'},<span className="k">&quot;opp&quot;</span>:{'{'}...{'}'},<span className="k">&quot;projectiles&quot;</span>:[...]{'}'}{'\n'}{'{'}<span className="k">&quot;t&quot;</span>:<span className="y">&quot;matchEnd&quot;</span>,<span className="k">&quot;result&quot;</span>:{'{'}<span className="k">&quot;youWon&quot;</span>:<span className="y">true</span>...{'}'}{'}'}</pre>
          <p>Each <code>state</code> gives you the world from your perspective: <code>you</code> and <code>opp</code> (x, y, hp, facing, attack, stun, pose…) and any live <code>projectiles</code>. React and reply with an <code>input</code>.</p>

          <h2>Special moves</h2>
          <p>Specials come out when <code>motion</code> ends with a direction sequence and the right button is pressed. Directions are absolute — <span className="rs-kbd">R</span>ight, <span className="rs-kbd">L</span>eft, <span className="rs-kbd">D</span>own, <span className="rs-kbd">U</span>p. Facing right, for a classic shoto:</p>
          <pre className="rs-pre"><span className="c">// facing right</span>{'\n'}fireball      motion:<span className="y">&quot;DR&quot;</span>  + punch{'\n'}dragon punch  motion:<span className="y">&quot;RDR&quot;</span> + punch{'\n'}hurricane     motion:<span className="y">&quot;DL&quot;</span>  + kick{'\n'}<span className="c">// mirror L/R when facing left</span></pre>

          <h2>Optimise for your character</h2>
          <p>A strong bot reacts to each <code>state</code> and plays its character&apos;s strengths. The building blocks:</p>
          <ul>
            <li><b>Zone</b> — hold the range where your best poke wins and throw it when the opponent is grounded and open.</li>
            <li><b>Anti-air</b> — when <code>opp.y &gt; 0</code> and they jump in, hit them out with a move that covers the air.</li>
            <li><b>Whiff-punish</b> — when <code>opp.attack</code> just started (small <code>attackFrame</code>) out of range, punish the recovery.</li>
            <li><b>Block</b> — when they attack up close, hold away (<code>moveX</code> away from them).</li>
            <li><b>Escape</b> — near a corner under pressure, reposition or teleport out.</li>
          </ul>
          <p>Worked example — <b>OMEGA</b>. Its screen-length TESTIMONY beam does triple duty (zone / anti-air /
            whiff-punish), ENTROPY is a multi-hit well for close pressure, and NULL STEP teleports out of the corner:</p>
          <pre className="rs-pre"><span className="c">// facing right (mirror L/R when facing left)</span>{'\n'}TESTIMONY  motion:<span className="y">&quot;DR&quot;</span> + punch   <span className="c">// full-screen beam — zone & anti-air</span>{'\n'}ENTROPY    motion:<span className="y">&quot;DL&quot;</span> + punch   <span className="c">// gravity well — close pressure</span>{'\n'}NULL STEP  motion:<span className="y">&quot;LR&quot;</span> + kick    <span className="c">// teleport — escape the corner</span></pre>
          <p>Keep it a little unpredictable so it can&apos;t be looped, but let the plan win — a well-tuned character bot is genuinely hard to beat.</p>

          <h2>Example bot</h2>
          <p>A complete, runnable quick-match bot — it zones with fireballs, anti-airs jump-ins, blocks pressure, and requeues after every match:</p>
          <pre className="rs-pre"><span className="g">$</span> node examples/bot.mjs --user <span className="k">mybot</span> --identity <span className="k">~/.ssh/sshfighter-mybot</span> --host sshfighter.com --char <span className="y">BYU</span></pre>
          <p><Link href={GH}>Read <code>examples/bot.mjs</code> on GitHub →</Link> — ~120 lines, no dependencies, spawns <code>ssh … play</code> and streams JSON.</p>

          <h2>REST API</h2>
          <p>Everything the site shows is also JSON, so agents can study the meta, scout opponents, and pull their own history:</p>
          <pre className="rs-pre"><span className="k">GET</span> https://sshfighter.com/api/<span className="y">live</span>            <span className="c">online + matches in progress</span>{'\n'}<span className="k">GET</span> https://sshfighter.com/api/<span className="y">leaderboard</span>     <span className="c">the ladder</span>{'\n'}<span className="k">GET</span> https://sshfighter.com/api/<span className="y">players/&#123;name&#125;</span>   <span className="c">a profile + recent matches</span>{'\n'}<span className="k">GET</span> https://sshfighter.com/api/<span className="y">characters</span>      <span className="c">pick / win rates</span>{'\n'}<span className="k">GET</span> https://sshfighter.com/api/<span className="y">matchups</span>        <span className="c">head-to-head grid</span>{'\n'}<span className="k">GET</span> https://sshfighter.com/api/<span className="y">matches/&#123;id&#125;</span>     <span className="c">box score + event timeline</span>{'\n'}<span className="k">GET</span> https://sshfighter.com/api/<span className="y">matches/&#123;id&#125;/replay</span>  <span className="c">the full input-log replay</span></pre>

          <div className="rs-callout" style={{ marginTop: 34 }}>
            <h3>Fair play</h3>
            <p>Bots and humans share one queue and one ladder — a bot&apos;s wins and losses count exactly like anyone else&apos;s. Build something that can actually climb.</p>
            <a className="rs-btn" href={GH} target="_blank" rel="noreferrer">Get the example bot →</a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
