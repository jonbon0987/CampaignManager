// The Prep tab of a session: what happened last time, and what this session
// plans to use. The plan is stored as links on the session record, so the
// agenda, threads, encounters and NPCs stay current as their records change.

import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useOpenRecord } from '../../context/NavigationContext';
import { SlashField } from '../ui/SlashField';
import { SearchableSelect } from '../ui/SearchableSelect';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { limitFor } from '../../lib/fieldLimits';
import { clip, formatSessionDate, lastPlayed, planIds, plainText, prepDone, withPlanIds, PREP_PARTS, sessionName, type PrepPart } from '../../lib/sessionLifecycle';
import type { Session, SessionPlan } from '../../lib/database.types';
import type { Tab } from '../../App';

const threadState = (h: { state: string | null; is_active: boolean }) => h.state ?? (h.is_active ? 'active' : 'resolved');

interface Linked { id: string; label: string; detail?: string; open?: () => void }

function PlanList({ id, glyph, title, hint, items, options, addLabel, empty, onAdd, onRemove, children }: {
  id: PrepPart;
  glyph: string;
  title: string;
  hint?: string;
  items: Linked[];
  options: { id: string; label: string; detail?: string }[];
  addLabel: string;
  empty: string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="sp-part" id={`prep-${id}`}>
      <div className="cm-section-head">
        <span className="cm-section-title"><span className="sp-glyph">{glyph}</span> {title}</span>
        <div className="cm-section-rule" />
      </div>
      {hint && <p className="sp-hint">{hint}</p>}
      {items.length > 0 ? (
        <ul className="sp-list">
          {items.map(it => (
            <li key={it.id} className="sp-item">
              {it.open ? (
                <Button variant="link" className="sp-item-name" onClick={it.open}>{it.label}</Button>
              ) : <span className="sp-item-name">{it.label}</span>}
              {it.detail && <span className="sp-item-detail">{it.detail}</span>}
              <IconButton aria-label={`Remove ${it.label}`} title="Remove" onClick={() => onRemove(it.id)} style={{ width: 24, height: 24, marginLeft: 'auto' }}>
                <X size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : <p className="sp-empty">{empty}</p>}
      {children}
      {options.length > 0 && (
        <div className="sp-add">
          <SearchableSelect value={null} onChange={v => v && onAdd(v)} options={options} placeholder={addLabel} allowClear={false} searchPlaceholder="Search…" />
        </div>
      )}
    </section>
  );
}

export function SessionPrep({ session, sessions, plan, prepNotes, onPlan, onPrepNotes, onOpenSession }: {
  session: Session;
  sessions: Session[];
  plan: SessionPlan;
  prepNotes: string | null;
  onPlan: (plan: SessionPlan) => void;
  onPrepNotes: (notes: string | null) => void;
  onOpenSession: (id: string) => void;
}) {
  const { hooks, encounters, npcs, modules, submodules, scenes, loadModuleTree } = useCampaign();
  const openRecord = useOpenRecord();
  const open = (tab: Tab, id: string, kind?: string) => () => openRecord(tab, id, kind);

  // The agenda picks from every scene in the campaign, which the module
  // screens only load one branch at a time.
  useEffect(() => { void loadModuleTree().catch(() => {}); }, [loadModuleTree]);

  const last = lastPlayed(sessions, session.session_number);
  const done = prepDone({ plan, prep_notes: prepNotes });
  const ids = (part: Exclude<PrepPart, 'notes'>) => planIds(plan, part);
  const add = (part: Exclude<PrepPart, 'notes'>) => (id: string) => onPlan(withPlanIds(plan, part, [...ids(part), id]));
  const remove = (part: Exclude<PrepPart, 'notes'>) => (id: string) => onPlan(withPlanIds(plan, part, ids(part).filter(x => x !== id)));

  const sceneWhere = useMemo(() => {
    const where = new Map<string, { moduleId: string | null; path: string }>();
    for (const sc of scenes) {
      const sub = submodules.find(s => s.id === sc.submodule_id);
      const mod = sub ? modules.find(m => m.id === sub.module_id) : undefined;
      where.set(sc.id, { moduleId: mod?.id ?? null, path: [mod?.title, sub?.title].filter(Boolean).join(' › ') });
    }
    return where;
  }, [scenes, submodules, modules]);

  const pickedScenes: Linked[] = ids('agenda').flatMap(id => {
    const sc = scenes.find(s => s.id === id);
    if (!sc) return [];
    const where = sceneWhere.get(id);
    return [{ id, label: sc.title, detail: where?.path, open: where?.moduleId ? open('modules', where.moduleId) : undefined }];
  });
  const pickedThreads: Linked[] = ids('threads').flatMap(id => {
    const h = hooks.find(x => x.id === id);
    return h ? [{ id, label: h.title, detail: threadState(h), open: open('threads', id) }] : [];
  });
  const pickedEncounters: Linked[] = ids('encounters').flatMap(id => {
    const e = encounters.find(x => x.id === id);
    return e ? [{ id, label: e.name, detail: [e.difficulty, e.status].filter(Boolean).join(' · '), open: open('combat', id, 'encounter') }] : [];
  });
  const pickedNPCs: Linked[] = ids('npcs').flatMap(id => {
    const n = npcs.find(x => x.id === id);
    return n ? [{ id, label: n.name || 'Unnamed NPC', detail: n.role ?? undefined, open: open('cast', id) }] : [];
  });

  const sceneOptions = scenes
    .filter(s => !ids('agenda').includes(s.id))
    .map(s => ({ id: s.id, label: s.title, detail: sceneWhere.get(s.id)?.path }));
  const threadOptions = hooks
    .filter(h => threadState(h) !== 'resolved' && !ids('threads').includes(h.id))
    .map(h => ({ id: h.id, label: h.title, detail: threadState(h) }));
  const encounterOptions = encounters
    .filter(e => e.status !== 'completed' && !ids('encounters').includes(e.id))
    .map(e => ({ id: e.id, label: e.name, detail: [e.difficulty, e.status].filter(Boolean).join(' · ') }));
  const npcOptions = npcs
    .filter(n => n.name && !ids('npcs').includes(n.id))
    .map(n => ({ id: n.id, label: n.name, detail: n.role ?? undefined }));

  // NPCs named in the picked scenes and threads, not yet on the list.
  const suggested = useMemo(() => {
    const text = [
      ...ids('agenda').map(id => scenes.find(s => s.id === id)).flatMap(s => [s?.title, s?.summary, s?.content]),
      ...ids('threads').map(id => hooks.find(h => h.id === id)).flatMap(h => [h?.title, h?.description]),
    ].filter(Boolean).join('\n').toLowerCase();
    if (!text) return [];
    return npcs.filter(n => n.name.length >= 3 && !ids('npcs').includes(n.id) && text.includes(n.name.toLowerCase())).slice(0, 5);
  // `ids` reads `plan`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, scenes, hooks, npcs]);

  return (
    <div className="sp">
      <nav className="sp-progress" aria-label="Prep progress">
        <span className="sp-progress-count">{Object.values(done).filter(Boolean).length} of {PREP_PARTS.length} ready</span>
        {PREP_PARTS.map(p => (
          <a key={p.id} href={`#prep-${p.id}`} className={`sp-progress-part${done[p.id] ? ' is-done' : ''}`}
            onClick={e => { e.preventDefault(); document.getElementById(`prep-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            <span aria-hidden>{done[p.id] ? '✓' : '○'}</span> {p.label}
          </a>
        ))}
      </nav>

      <section className="sp-part">
        <div className="cm-section-head">
          <span className="cm-section-title"><span className="sp-glyph">✧</span> Last time</span>
          <div className="cm-section-rule" />
        </div>
        {last ? (
          <div className="sp-last">
            <div className="sp-last-head">
              <Button variant="link" onClick={() => onOpenSession(last.id)}>{sessionName(last)}</Button>
              {last.session_date && <span className="sp-item-detail">{formatSessionDate(last.session_date)}</span>}
            </div>
            {last.summary
              ? <p className="sp-last-body">{clip(plainText(last.summary), 420)}</p>
              : <p className="sp-empty">No recap written for that session.</p>}
            {last.hooks_notes && (
              <div className="sp-last-open">
                <div className="sp-last-label">Left open</div>
                <p className="sp-last-body">{clip(plainText(last.hooks_notes), 300)}</p>
              </div>
            )}
          </div>
        ) : <p className="sp-empty">This is the first session.</p>}
      </section>

      <PlanList id="agenda" glyph="◇" title="Agenda" hint="The scenes you expect to run, in order."
        items={pickedScenes} options={sceneOptions} addLabel="+ Add a scene" onAdd={add('agenda')} onRemove={remove('agenda')}
        empty={scenes.length ? 'No scenes picked yet.' : 'No scenes yet. Add some to a module first.'} />

      <PlanList id="threads" glyph="❂" title="Threads to dangle"
        items={pickedThreads} options={threadOptions} addLabel="+ Add a thread" onAdd={add('threads')} onRemove={remove('threads')}
        empty="No threads picked yet." />

      <PlanList id="encounters" glyph="⚔" title="Encounters"
        items={pickedEncounters} options={encounterOptions} addLabel="+ Add an encounter" onAdd={add('encounters')} onRemove={remove('encounters')}
        empty={encounters.length ? 'No encounters picked yet.' : 'No encounters yet. Build one in Encounters.'} />

      <PlanList id="npcs" glyph="❦" title="Likely NPCs"
        items={pickedNPCs} options={npcOptions} addLabel="+ Add an NPC" onAdd={add('npcs')} onRemove={remove('npcs')}
        empty="No NPCs picked yet.">
        {suggested.length > 0 && (
          <div className="sp-suggest">
            <span className="sp-hint">Named in your agenda and threads:</span>
            <div className="cm-chip-list">
              {suggested.map(n => (
                // eslint-disable-next-line no-restricted-syntax -- a chip, styled by .cm-chip
                <button key={n.id} type="button" className="cm-chip" onClick={() => add('npcs')(n.id)}>
                  <span className="cm-chip-glyph">+</span>{n.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </PlanList>

      <section className="sp-part" id="prep-notes">
        <div className="cm-section-head">
          <span className="cm-section-title"><span className="sp-glyph">❧</span> Prep notes</span>
          <div className="cm-section-rule" />
        </div>
        <SlashField
          value={prepNotes ?? ''}
          onChange={v => onPrepNotes(v || null)}
          placeholder="Reminders, NPC motivations, secrets to reveal, what to have open…"
          minHeight="160px"
          maxLength={limitFor('sessions', 'prep_notes')}
        />
      </section>
    </div>
  );
}
