/* ============================================================================
 * WorldCreationGate.tsx  —  src/components/world/WorldCreationGate.tsx
 *
 * The four-path world-creation flow, used in two modes:
 *   • first-world (no onClose)  — blocking full-screen takeover mounted by
 *     WorldRoot when the user has zero worlds; only escape is Log out.
 *   • additional-world (onClose) — dismissable overlay opened from the world
 *     selector to create another world; different wording, a ✕/Cancel close.
 *
 * Both offer the same four ways in:
 *   • scratch  — name + optional tagline → createWorld
 *   • example  — a prebuilt setting → createWorld + seed curated entities
 *   • import   — parse a document → createWorld + seed parsed entities
 *   • ai       — draft with the Assistant → createWorld + seed generated entities
 *
 * On success in first-world mode, createWorld() flips worlds.length 0 → 1, so
 * WorldRoot unmounts this gate and renders the (now-existing) World Overview.
 * In additional-world mode the new world is already active behind the overlay,
 * so afterCreate() (= onClose) just dismisses it. Seeding + a forced entity
 * reload run on the WorldProvider (which outlives this component), so the
 * landing overview reflects the seeded content.
 * ========================================================================== */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { useWorld } from '../../context/WorldContext';
import { signOut } from '../../lib/auth';
import { getAIProvider } from '../../lib/aiProvider';
import { extractClientSide, submitDocument } from '../../lib/documentImport';
import {
  EXAMPLE_WORLDS, exampleCounts, seedWorldEntities, importActionsToSeed,
  type WorldSeed,
} from '../../lib/worldSeeds';
import { generateWorldDraft, type WorldDraft } from '../../lib/generateWorld';
import { limitFor } from '../../lib/fieldLimits';
import './firstWorldGate.css';

type Route = 'menu' | 'scratch' | 'example' | 'import' | 'ai';

const OPTIONS: { id: Route; glyph: string; color: string; title: string; desc: string }[] = [
  { id: 'scratch', glyph: '✧',       color: 'var(--gold)',   title: 'Start from scratch',          desc: 'Name it and begin with a blank slate.' },
  { id: 'example', glyph: '❖',       color: 'var(--moss)',   title: 'Use a prebuilt example',      desc: 'Start from a ready-made world and reshape it.' },
  { id: 'import',  glyph: '❦︎', color: 'var(--sky)',    title: 'Import from a document',      desc: 'Turn a PDF, DOCX, or Markdown file into a world.' },
  { id: 'ai',      glyph: '✦',       color: 'var(--accent)', title: 'Generate with the Assistant', desc: 'Describe an idea and let it draft the bones.' },
];

const AI_SAMPLES = [
  'A sunken empire of coral spires ruled by tide-priests',
  'A neutral trade-city between three warring gods',
  'A frostbound realm where the dead don’t stay buried',
];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

// The parse-document endpoint requires a non-empty campaignContext. A world
// created from the gate has no existing entities yet, so we send this instead of
// an empty string — it also tells the model to treat everything it finds as new.
const NEW_WORLD_CONTEXT =
  '== EXISTING WORLD DATA ==\n\n(This is a brand-new, empty world with no existing entities. ' +
  'Treat every entity you extract as new — set "matched_id" to null for all of them.)';

/**
 * Shared "create the world, seeding it in the same pass" helper. The seed runs
 * inside createWorld *before* the world is activated, so its entities load in a
 * single fetch — no create → empty → reload → full flicker. Errors from the
 * whole operation surface on the still-mounted gate via the caller's try/catch.
 */
function useCreateSeededWorld() {
  const { createWorld } = useWorld();
  return useCallback(async (name: string, tagline: string, seed?: WorldSeed) => {
    const hasSeed = !!seed && !!(seed.factions.length || seed.locations.length || seed.npcs.length || seed.lore.length);
    return hasSeed
      ? createWorld(name, tagline, worldId => seedWorldEntities(worldId, seed!))
      : createWorld(name, tagline);
  }, [createWorld]);
}

interface WorldCreationGateProps {
  /** Signed-in user — only used for the first-world footer. Optional in additional mode. */
  user?: User;
  /**
   * When provided, the gate is a dismissable "create another world" modal:
   * different wording, a close affordance, and `onClose` is called on cancel
   * AND after a successful create (the new world is already active behind it).
   * When absent, the gate is the blocking first-world takeover — createWorld
   * flips worlds 0 → 1 and WorldRoot unmounts it, so no close is needed.
   */
  onClose?: () => void;
}

export default function WorldCreationGate({ user, onClose }: WorldCreationGateProps) {
  const additional = !!onClose;
  const [route, setRoute] = useState<Route>('menu');
  const back = () => setRoute('menu');

  // Additional-world mode: after a successful create, the world is already
  // active behind the overlay, so just close. First-world mode: onClose is
  // undefined and WorldRoot unmounts the gate when worlds becomes non-empty.
  const afterCreate = onClose;

  // Esc closes the dismissable (additional) gate.
  useEffect(() => {
    if (!additional) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [additional, onClose]);

  return (
    <div
      className={'fwg-gate' + (additional ? ' fwg-overlay' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={additional ? 'Create a new world' : 'Create your first world'}
    >
      {additional && (
        <button className="fwg-close" onClick={onClose} aria-label="Close" title="Close">✕</button>
      )}
      {route === 'menu' && (
        <div className="fwg-col fwg-fade">
          <div className="fwg-head">
            <div className="fwg-crest" aria-hidden="true">❖</div>
            <div className="fwg-eyebrow">{additional ? 'New world' : 'Welcome to DM Lair'}</div>
            <h1 className="fwg-title">{additional ? 'Create a new world' : 'Create your first world'}</h1>
            <p className="fwg-sub">
              {additional
                ? 'A separate home for its own campaigns, lore, maps, and cast — start it however you like.'
                : 'A world is the home for your campaigns, lore, maps, and characters.'}
            </p>
          </div>
          <div className="fwg-opts">
            {OPTIONS.map(o => (
              <button className="fwg-opt" key={o.id} onClick={() => setRoute(o.id)}>
                <span
                  className="fwg-opt-glyph"
                  aria-hidden="true"
                  style={{
                    color: o.color,
                    background: `color-mix(in srgb, ${o.color} 12%, transparent)`,
                    borderColor: `color-mix(in srgb, ${o.color} 30%, transparent)`,
                  }}
                >
                  {o.glyph}
                </span>
                <span className="fwg-opt-body">
                  <span className="fwg-opt-title">{o.title}</span>
                  <span className="fwg-opt-desc">{o.desc}</span>
                </span>
                <span className="fwg-opt-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <div className="fwg-foot">
            {additional ? (
              <button className="fwg-linkbtn" onClick={onClose}>Cancel</button>
            ) : (
              <>
                <span className="fwg-foot-id">Signed in as <b>{user?.email}</b></span>
                <button className="fwg-linkbtn" onClick={() => signOut()}>Log out</button>
              </>
            )}
          </div>
        </div>
      )}

      {route === 'scratch' && <ScratchPanel onBack={back} afterCreate={afterCreate} />}
      {route === 'example' && <ExamplePanel onBack={back} afterCreate={afterCreate} />}
      {route === 'import'  && <ImportPanel  onBack={back} afterCreate={afterCreate} />}
      {route === 'ai'      && <AiPanel      onBack={back} afterCreate={afterCreate} />}
    </div>
  );
}

/** Every path panel gets a way back to the menu and an optional post-create hook. */
interface PanelProps {
  onBack: () => void;
  /** Called after a successful create — closes the overlay in additional mode. */
  afterCreate?: () => void;
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return <button className="fwg-back" onClick={onBack}>‹ All options</button>;
}

/* ── Path 1: scratch ─────────────────────────────────────────────────────── */
function ScratchPanel({ onBack, afterCreate }: PanelProps) {
  const createSeeded = useCreateSeededWorld();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await createSeeded(name.trim(), tag.trim());
      afterCreate?.(); // additional mode: close the overlay. first mode: no-op (gate unmounts).
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  return (
    <div className="fwg-col fwg-fade" style={{ maxWidth: 540 }}>
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Name your world</h2>
      <p className="fwg-psub">You can rename it and change everything later — this is just a starting point.</p>
      <div className="fwg-field">
        <label className="fwg-label">World name</label>
        <input ref={ref} className="fwg-inp" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          maxLength={limitFor('worlds', 'name')}
          placeholder="e.g. The Amber Waste" />
      </div>
      <div className="fwg-field">
        <label className="fwg-label">Tagline <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
        <input className="fwg-inp" value={tag}
          onChange={e => setTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          maxLength={limitFor('worlds', 'tagline')}
          placeholder="A line that captures its feel." />
        <div className="fwg-hint">Shown under the world title on your overview.</div>
      </div>
      {err && <div className="fwg-error">{err}</div>}
      <div className="fwg-btn-row">
        <button className="fwg-btn fwg-btn-primary" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create world'}
        </button>
        <button className="fwg-btn fwg-btn-ghost" onClick={onBack} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Path 2: prebuilt example ────────────────────────────────────────────── */
function ExamplePanel({ onBack, afterCreate }: PanelProps) {
  const createSeeded = useCreateSeededWorld();
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = EXAMPLE_WORLDS.find(e => e.id === sel);

  const create = async () => {
    if (!chosen || busy) return;
    setBusy(true); setErr('');
    try {
      await createSeeded(chosen.name, chosen.tagline, chosen.seed);
      afterCreate?.();
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  return (
    <div className="fwg-col fwg-fade">
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Choose a starting world</h2>
      <p className="fwg-psub">A prebuilt setting comes seeded with locations, NPCs, and factions. Reshape any of it once you’re in.</p>
      <div className="fwg-ex-list">
        {EXAMPLE_WORLDS.map(e => {
          const c = exampleCounts(e);
          return (
            <button className={'fwg-ex' + (sel === e.id ? ' is-sel' : '')} key={e.id} onClick={() => setSel(e.id)}>
              <span className="fwg-ex-glyph" aria-hidden="true">❖</span>
              <span className="fwg-ex-body">
                <span className="fwg-ex-name">{e.name}</span>
                <span className="fwg-ex-tag">{e.tagline}</span>
                <span className="fwg-ex-meta">
                  <span>✦ {c.loc} locations</span><span>◇ {c.npc} NPCs</span><span>◈ {c.fac} factions</span><span>❦ {c.lore} lore</span>
                </span>
              </span>
              <span className="fwg-ex-check" aria-hidden="true">{sel === e.id ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      {err && <div className="fwg-error">{err}</div>}
      <div className="fwg-btn-row">
        <button className="fwg-btn fwg-btn-primary" disabled={!chosen || busy} onClick={create}>
          {busy ? 'Creating…' : 'Create from this world'}
        </button>
        <button className="fwg-btn fwg-btn-ghost" onClick={onBack} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Path 3: import a document ───────────────────────────────────────────── */
function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Derive a starting world name from a filename: strip extension + separators. */
function nameFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stem.replace(/\b\w/g, c => c.toUpperCase());
}

/** First sentence of the parse summary, trimmed to a tagline length. */
function taglineFromSummary(summary: string): string {
  const first = summary.split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
  return first.length > 160 ? first.slice(0, 157).trimEnd() + '…' : first;
}

function ImportPanel({ onBack, afterCreate }: PanelProps) {
  const createSeeded = useCreateSeededWorld();
  const [stage, setStage] = useState<'drop' | 'reading' | 'ready'>('drop');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [seed, setSeed] = useState<WorldSeed>({ factions: [], locations: [], npcs: [], lore: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const onFile = async (f: File) => {
    setErr('');
    setFile({ name: f.name, size: f.size });
    setStage('reading');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const input = await extractClientSide(f);
      const { summary, actions } = await submitDocument(
        input, NEW_WORLD_CONTEXT, undefined, undefined, undefined, undefined,
        controller.signal, getAIProvider(), 'world',
      );
      const parsedSeed = importActionsToSeed(actions);
      setSeed(parsedSeed);
      setName(nameFromFilename(f.name));
      setTag(taglineFromSummary(summary));
      setStage('ready');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setErr(errMsg(e));
      setStage('drop');
      setFile(null);
    }
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await createSeeded(name.trim(), tag.trim(), seed);
      afterCreate?.();
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setStage('drop'); setFile(null); setName(''); setTag('');
    setSeed({ factions: [], locations: [], npcs: [], lore: [] }); setErr('');
  };

  const seedCount = seed.factions.length + seed.locations.length + seed.npcs.length + seed.lore.length;

  return (
    <div className="fwg-col fwg-fade" style={{ maxWidth: 560 }}>
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Import from a document</h2>
      <p className="fwg-psub">Bring in a world bible or setting doc. We’ll read it, pull out a name and summary, and stage the rest for review.</p>

      <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      {stage === 'drop' && (
        <>
          <div
            className={'fwg-drop' + (dragging ? ' is-drag' : '')}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
            }}
          >
            <div className="fwg-drop-glyph" aria-hidden="true">❦{'︎'}</div>
            <div className="fwg-drop-title">Drop a file here, or <span style={{ color: 'var(--gold)' }}>browse</span></div>
            <div className="fwg-drop-sub">PDF · DOCX · MARKDOWN · TXT</div>
          </div>
          {err && <div className="fwg-error">{err}</div>}
        </>
      )}

      {stage === 'reading' && (
        <div>
          <div className="fwg-file-chip">
            <span className="fwg-file-chip-glyph" aria-hidden="true">❦{'︎'}</span>
            <span className="fwg-file-chip-name">{file?.name}</span>
            {file && <span className="fwg-file-chip-size">{prettySize(file.size)}</span>}
          </div>
          <div className="fwg-working"><span className="fwg-spinner" aria-hidden="true" />Reading your document…</div>
        </div>
      )}

      {stage === 'ready' && (
        <div className="fwg-fade">
          <div className="fwg-file-chip">
            <span className="fwg-file-chip-glyph" aria-hidden="true">❦{'︎'}</span>
            <span className="fwg-file-chip-name">{file?.name}</span>
            <span className="fwg-file-chip-read">✓ read</span>
          </div>
          <p className="fwg-hint" style={{ margin: '0 0 16px' }}>
            We found a title and summary{seedCount > 0 ? `, plus ${seedCount} ${seedCount === 1 ? 'entry' : 'entries'} to seed` : ''}. Edit anything before creating.
          </p>
          <div className="fwg-field">
            <label className="fwg-label">World name</label>
            <input className="fwg-inp" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create(); }} maxLength={limitFor('worlds', 'name')} />
          </div>
          <div className="fwg-field">
            <label className="fwg-label">Tagline</label>
            <input className="fwg-inp" value={tag} onChange={e => setTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create(); }} maxLength={limitFor('worlds', 'tagline')} />
          </div>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" disabled={!name.trim() || busy} onClick={create}>
              {busy ? 'Creating…' : 'Create world'}
            </button>
            <button className="fwg-btn fwg-btn-ghost" onClick={reset} disabled={busy}>Choose another file</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Path 4: generate with the Assistant ─────────────────────────────────── */
function AiPanel({ onBack, afterCreate }: PanelProps) {
  const createSeeded = useCreateSeededWorld();
  const [prompt, setPrompt] = useState('');
  const [stage, setStage] = useState<'prompt' | 'working' | 'result'>('prompt');
  const [result, setResult] = useState<WorldDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const gen = async () => {
    if (!prompt.trim()) return;
    setStage('working'); setErr('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const draft = await generateWorldDraft(prompt.trim(), controller.signal);
      setResult(draft);
      setStage('result');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setErr(errMsg(e));
      setStage('prompt');
    }
  };

  const create = async () => {
    if (!result || busy) return;
    setBusy(true); setErr('');
    try {
      await createSeeded(result.name, result.tagline, result.seed);
      afterCreate?.();
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  return (
    <div className="fwg-col fwg-fade" style={{ maxWidth: 560 }}>
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Describe your world</h2>
      <p className="fwg-psub">A sentence or two is plenty. The Assistant drafts a name, a tagline, and a handful of seeds you can keep or discard.</p>

      {stage !== 'result' && (
        <div className="fwg-field">
          <label className="fwg-label">Your idea</label>
          <textarea className="fwg-inp" value={prompt} onChange={e => setPrompt(e.target.value)}
            disabled={stage === 'working'}
            placeholder="e.g. A sunken empire of coral spires ruled by tide-priests…" />
          <div className="fwg-chips">
            {AI_SAMPLES.map((s, i) => <button className="fwg-chip" key={i} onClick={() => setPrompt(s)} disabled={stage === 'working'}>{s}</button>)}
          </div>
        </div>
      )}
      {stage === 'prompt' && (
        <>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" disabled={!prompt.trim()} onClick={gen}>✦ Generate world</button>
            <button className="fwg-btn fwg-btn-ghost" onClick={onBack}>Cancel</button>
          </div>
        </>
      )}
      {stage === 'working' && <div className="fwg-working"><span className="fwg-spinner" aria-hidden="true" />Drafting your world…</div>}
      {stage === 'result' && result && (
        <div className="fwg-fade">
          <div className="fwg-result">
            <div className="fwg-result-eyebrow">✦ Draft</div>
            <div className="fwg-result-name">{result.name}</div>
            {result.tagline && <div className="fwg-result-tag">{result.tagline}</div>}
            {result.summaryLines.length > 0 && (
              <div className="fwg-seeds">
                {result.summaryLines.map((s, i) => (
                  <div className="fwg-seed" key={i}><span className="fwg-seed-glyph" aria-hidden="true">{s.glyph}</span>{s.text}</div>
                ))}
              </div>
            )}
          </div>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" disabled={busy} onClick={create}>
              {busy ? 'Creating…' : 'Create world'}
            </button>
            <button className="fwg-btn fwg-btn-ghost" disabled={busy} onClick={() => { setStage('prompt'); setResult(null); }}>↺ Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}
