// A session's prep on one sheet of paper, for the table: the party, last time,
// the agenda with its read-aloud, and the threads, encounters and NPCs to have
// at hand. It opens as a preview; Print (or Save as PDF) prints only the sheet.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCampaign } from '../../context/CampaignContext';
import { useCampaignDate } from '../../hooks/useCampaignDate';
import { clockDots } from '../../lib/threadClock';
import { dateOf, formatSpan, formatWorldDate } from '../../lib/calendar';
import { refsToNames } from '../../lib/slashMarkdown';
import { clip, formatSessionDate, lastPlayed, leftOpenLines, planIds, plainText, sessionName } from '../../lib/sessionLifecycle';
import { parseCombatants } from '../ui/EncounterDetail';
import { MarkdownContent } from '../ui/MarkdownContent';
import { Button } from '../ui/Button';
import type { Session, SessionPlan } from '../../lib/database.types';

const threadState = (h: { state: string | null; is_active: boolean }) => h.state ?? (h.is_active ? 'active' : 'resolved');
const line = (md: string | null | undefined, max: number) => clip(plainText(md ?? ''), max);

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="psh-part">
      <h2 className="psh-h">{title}</h2>
      {children}
    </section>
  );
}

export function PrepSheet({ session, sessions, plan, prepNotes, onClose }: {
  session: Session;
  sessions: Session[];
  plan: SessionPlan;
  prepNotes: string | null;
  onClose: () => void;
}) {
  const { selectedCampaign, pcs, hooks, encounters, npcs, scenes, submodules, modules, monsterStatblocks } = useCampaign();
  const { date: campaignDate, months, suffix } = useCampaignDate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const last = lastPlayed(sessions, session.session_number);
  const start = dateOf(session.world_start);
  const inWorld = start ? formatSpan(start, dateOf(session.world_end), months, suffix)
    : campaignDate ? formatWorldDate(campaignDate, months, suffix) : null;

  const party = pcs.filter(p => p.is_active);
  const agenda = planIds(plan, 'agenda').flatMap(id => {
    const sc = scenes.find(s => s.id === id);
    if (!sc) return [];
    const sub = submodules.find(s => s.id === sc.submodule_id);
    const mod = sub ? modules.find(m => m.id === sub.module_id) : undefined;
    return [{ sc, where: [mod?.title, sub?.title].filter(Boolean).join(' › ') }];
  });
  const threads = planIds(plan, 'threads').flatMap(id => hooks.filter(h => h.id === id));
  const fights = planIds(plan, 'encounters').flatMap(id => encounters.filter(e => e.id === id));
  const people = planIds(plan, 'npcs').flatMap(id => npcs.filter(n => n.id === id));
  const opened = leftOpenLines(last?.hooks_notes).slice(0, 6);
  const notes = refsToNames(prepNotes ?? '').trim();
  const nothing = !agenda.length && !threads.length && !fights.length && !people.length && !notes;

  return createPortal(
    <div className="print-root psh-back" role="dialog" aria-modal="true" aria-label="Prep sheet">
      <div className="psh-bar">
        <span className="psh-bar-title">Prep sheet · {sessionName(session)}</span>
        <Button variant="primary" size="sm" onClick={() => window.print()}>Print</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <article className="psh">
        <header className="psh-head">
          <div className="psh-eyebrow">{selectedCampaign?.title?.trim() || selectedCampaign?.name || 'Campaign'} · Prep sheet</div>
          <h1 className="psh-title">{sessionName(session)}</h1>
          <div className="psh-meta">
            {[session.session_date ? formatSessionDate(session.session_date) : null, inWorld ? `In the world: ${inWorld}` : null].filter(Boolean).join(' · ')}
          </div>
        </header>

        {party.length > 0 && (
          <Part title="Party">
            <ul className="psh-party">
              {party.map(p => {
                const who = [p.race, p.class].filter(Boolean).join(' ');
                const level = p.level ? (who ? `${who} ${p.level}` : `level ${p.level}`) : who;
                return (
                  <li key={p.id}>
                    <b>{p.character_name || 'Unnamed character'}</b>{' '}
                    {[level, p.armor_class ? `AC ${p.armor_class}` : null, p.max_hp ? `HP ${p.max_hp}` : null].filter(Boolean).join(' · ')}
                  </li>
                );
              })}
            </ul>
          </Part>
        )}

        <Part title={last ? `Last time · ${sessionName(last)}` : 'Last time'}>
          {last?.summary ? <p className="psh-p">{line(last.summary, 600)}</p>
            : <p className="psh-empty">{last ? 'No recap written for that session.' : 'This is the first session.'}</p>}
          {opened.length > 0 && (
            <>
              <div className="psh-label">Left open</div>
              <ul className="psh-list">{opened.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </>
          )}
        </Part>

        {agenda.length > 0 && (
          <Part title="Agenda">
            <ol className="psh-agenda">
              {agenda.map(({ sc, where }) => (
                <li key={sc.id}>
                  <b>{sc.title || 'Untitled scene'}</b>{where && <span className="psh-dim"> · {where}</span>}
                  {sc.summary && <p className="psh-p">{line(sc.summary, 240)}</p>}
                  {sc.read_aloud?.trim() && <blockquote className="psh-ra">{refsToNames(sc.read_aloud).trim()}</blockquote>}
                </li>
              ))}
            </ol>
          </Part>
        )}

        <div className="psh-cols">
          {threads.length > 0 && (
            <Part title="Threads to dangle">
              <ul className="psh-list">
                {threads.map(h => (
                  <li key={h.id}><b>{h.title}</b> <span className="psh-dim">({threadState(h)}{h.clock_size ? ` · ${clockDots({ size: h.clock_size, filled: h.clock_filled ?? 0 })}` : ''})</span>{h.description ? ` ${line(h.description, 160)}` : ''}</li>
                ))}
              </ul>
            </Part>
          )}
          {fights.length > 0 && (
            <Part title="Encounters">
              <ul className="psh-list">
                {fights.map(e => (
                  <li key={e.id}>
                    <b>{e.name}</b>{(e.difficulty || e.environment) && <span className="psh-dim"> · {[e.difficulty, e.environment].filter(Boolean).join(' · ')}</span>}
                    <div>
                      {parseCombatants(e.combatants).map(c => {
                        const sb = c.statblock_id ? monsterStatblocks.find(s => s.id === c.statblock_id) : undefined;
                        const stats = [sb?.armor_class ? `AC ${sb.armor_class}` : null, sb?.hit_points ? `HP ${sb.hit_points}` : null].filter(Boolean).join(', ');
                        return `${c.count > 1 ? `${c.count} × ` : ''}${sb?.name || c.name}${stats ? ` (${stats})` : ''}`;
                      }).join('; ')}
                    </div>
                  </li>
                ))}
              </ul>
            </Part>
          )}
          {people.length > 0 && (
            <Part title="Likely NPCs">
              <ul className="psh-list">
                {people.map(n => (
                  <li key={n.id}>
                    <b>{n.name || 'Unnamed NPC'}</b>{(n.role || n.disposition) && <span className="psh-dim"> · {[n.role, n.disposition].filter(Boolean).join(' · ')}</span>}
                    {(n.hooks_motivations || n.description) && ` ${line(n.hooks_motivations || n.description, 140)}`}
                  </li>
                ))}
              </ul>
            </Part>
          )}
          {notes && (
            <Part title="Prep notes">
              <MarkdownContent text={notes} className="psh-notes" />
            </Part>
          )}
        </div>

        {nothing && <p className="psh-empty">Nothing planned yet. Pick scenes, threads, encounters and NPCs in Prep, and they’ll appear here.</p>}
      </article>
    </div>,
    document.body,
  );
}
