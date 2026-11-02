// The players' read-only page at /p/<token>. Anyone with the link can open it
// without signing in. It shows what player_page() returns: the party, and the
// recaps, handouts, people, places and lore the DM switched on, with their
// player-facing fields only. Nothing here can change anything.

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PlayerPages } from '../../lib/db';
import { refsToNames } from '../../lib/slashMarkdown';
import { formatSessionDate } from '../../lib/sessionLifecycle';
import { useImageUrl } from '../../hooks/useImageUrl';
import { Button } from '../ui/Button';
import { Lightbox } from '../ui/Lightbox';
import type { PlayerPageData } from '../../lib/database.types';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; data: PlayerPageData };

/** Keeps the page out of search engines, and its link out of Referer headers. */
function usePrivatePage() {
  useEffect(() => {
    const tags = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      return meta;
    });
    return () => tags.forEach(t => t.remove());
  }, []);
}

function Prose({ text }: { text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <div className="markdown-preview pp-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>
        {refsToNames(text)}
      </ReactMarkdown>
    </div>
  );
}

function Portrait({ path, name }: { path: string | null; name: string }) {
  const url = useImageUrl(path);
  return url
    ? <img className="pp-portrait" src={url} alt={name} />
    : <span className="pp-portrait is-empty" aria-hidden>{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

/** A picture that opens full-screen: a handout, or a place's map. */
function Picture({ path, title, className, onShow }: { path: string; title: string; className: string; onShow: (url: string, title: string) => void }) {
  const url = useImageUrl(path);
  return (
    // eslint-disable-next-line no-restricted-syntax -- the picture itself, shown full-screen
    <button type="button" className={className} onClick={() => url && onShow(url, title)} aria-label={`Show ${title} full-screen`}>
      {url ? <img src={url} alt={title} /> : <span className="ho-loading">…</span>}
    </button>
  );
}

const SECTIONS = [
  ['recaps', 'story', 'The story so far'],
  ['handouts', 'handouts', 'Handouts'],
  ['people', 'people', 'People'],
  ['places', 'places', 'Places'],
  ['lore', 'lore', 'Lore'],
] as const;

const NPC_STATUS: Record<string, string | undefined> = { deceased: 'Deceased', unknown: 'Fate unknown' };

function Page({ data }: { data: PlayerPageData }) {
  const [showing, setShowing] = useState<{ url: string; title: string } | null>(null);
  const show = (url: string, title: string) => setShowing({ url, title });
  const name = data.campaign.title?.trim() || data.campaign.name;
  const present = SECTIONS.filter(([key]) => data[key].length > 0);

  useEffect(() => { document.title = `${name} · Player page`; }, [name]);

  return (
    <div className="pp">
      <header className="pp-head">
        <div className="pp-eyebrow">Player page</div>
        <h1 className="pp-title">{name}</h1>
        {present.length > 1 && (
          <nav className="pp-nav" aria-label="Sections">
            {present.map(([, id, label]) => <a key={id} className="pp-nav-link" href={`#${id}`}>{label}</a>)}
          </nav>
        )}
      </header>

      {data.party.length > 0 && (
        <section className="pp-sec" id="party" aria-labelledby="pp-party">
          <h2 className="pp-h2" id="pp-party">The party</h2>
          <ul className="pp-party">
            {data.party.map(pc => (
              <li key={pc.id} className="pp-pc">
                <Portrait path={pc.portrait} name={pc.name} />
                <div>
                  <div className="pp-pc-name">{pc.name}</div>
                  <div className="pp-sub">
                    {[pc.level ? `Level ${pc.level}` : null, pc.race, pc.class].filter(Boolean).join(' ')}
                    {pc.player ? ` · played by ${pc.player}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {present.length === 0 && (
        <p className="pp-empty">Nothing else has been shared yet. Your DM adds recaps, handouts, people, places and lore here as the campaign goes on.</p>
      )}

      {data.recaps.length > 0 && (
        <section className="pp-sec" id="story" aria-labelledby="pp-story">
          <h2 className="pp-h2" id="pp-story">The story so far</h2>
          {data.recaps.map(r => (
            <article key={r.id} className="pp-item" id={`recap-${r.id}`}>
              <div className="pp-eyebrow">Session {r.number}{r.date ? ` · ${formatSessionDate(r.date)}` : ''}</div>
              <h3 className="pp-h3">{r.title?.trim() || `Session ${r.number}`}</h3>
              {r.summary?.trim() ? <Prose text={r.summary} /> : <p className="pp-sub">No recap written yet.</p>}
              {r.loot?.trim() && (
                <div className="pp-loot">
                  <div className="pp-label">Loot and rewards</div>
                  <Prose text={r.loot} />
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {data.handouts.length > 0 && (
        <section className="pp-sec" id="handouts" aria-labelledby="pp-handouts">
          <h2 className="pp-h2" id="pp-handouts">Handouts</h2>
          <div className="ho-grid">
            {data.handouts.map(h => (
              <figure key={h.id} className="ho-card" id={`handout-${h.id}`}>
                <Picture path={h.image} title={h.title || 'Handout'} className="ho-thumb" onShow={show} />
                <figcaption className="ho-title-text">{h.title || 'Untitled handout'}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {data.people.length > 0 && (
        <section className="pp-sec" id="people" aria-labelledby="pp-people">
          <h2 className="pp-h2" id="pp-people">People</h2>
          {data.people.map(n => (
            <article key={n.id} className="pp-item pp-person" id={`npc-${n.id}`}>
              <Portrait path={n.portrait} name={n.name} />
              <div className="pp-person-text">
                <h3 className="pp-h3">{n.name}</h3>
                {(n.role || NPC_STATUS[n.status]) && (
                  <div className="pp-sub">{[n.role, NPC_STATUS[n.status]].filter(Boolean).join(' · ')}</div>
                )}
                <Prose text={n.description} />
              </div>
            </article>
          ))}
        </section>
      )}

      {data.places.length > 0 && (
        <section className="pp-sec" id="places" aria-labelledby="pp-places">
          <h2 className="pp-h2" id="pp-places">Places</h2>
          {data.places.map(l => (
            <article key={l.id} className="pp-item" id={`place-${l.id}`}>
              <h3 className="pp-h3">{l.name}</h3>
              {(l.type || l.region) && (
                <div className="pp-sub">{[l.type?.replace(/_/g, ' '), l.region].filter(Boolean).join(' · ')}</div>
              )}
              {l.map && <Picture path={l.map} title={`Map of ${l.name}`} className="pp-map" onShow={show} />}
              <Prose text={l.description} />
            </article>
          ))}
        </section>
      )}

      {data.lore.length > 0 && (
        <section className="pp-sec" id="lore" aria-labelledby="pp-lore">
          <h2 className="pp-h2" id="pp-lore">Lore</h2>
          {data.lore.map(e => (
            <article key={e.id} className="pp-item" id={`lore-${e.id}`}>
              {e.category && <div className="pp-eyebrow">{e.category}</div>}
              <h3 className="pp-h3">{e.title}</h3>
              <Prose text={e.content} />
            </article>
          ))}
        </section>
      )}

      {showing && <Lightbox url={showing.url} title={showing.title} onClose={() => setShowing(null)} />}
    </div>
  );
}

export default function PlayerPage({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  usePrivatePage();

  // A ready page names its campaign in the tab (see Page); until then, this.
  useEffect(() => { if (state.status !== 'ready') document.title = 'Player page'; }, [state.status]);

  useEffect(() => {
    let live = true;
    PlayerPages.load(token)
      .then(data => { if (live) setState(data ? { status: 'ready', data } : { status: 'missing' }); })
      .catch(() => { if (live) setState({ status: 'failed' }); });
    return () => { live = false; };
  }, [token, attempt]);

  if (state.status === 'ready') return <Page data={state.data} />;
  if (state.status === 'loading') return <div className="pp-status">Opening…</div>;
  return (
    <div className="pp-status">
      {state.status === 'missing' ? (
        <>
          <h1 className="pp-h2">This page isn’t available</h1>
          <p>The link may have been turned off or replaced. Ask your DM for the current one.</p>
        </>
      ) : (
        <>
          <h1 className="pp-h2">Couldn’t open this page</h1>
          <p>Check your connection and try again.</p>
          <Button size="sm" variant="secondary" onClick={() => { setState({ status: 'loading' }); setAttempt(a => a + 1); }}>Try again</Button>
        </>
      )}
    </div>
  );
}
