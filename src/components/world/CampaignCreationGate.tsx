/* ============================================================================
 * CampaignCreationGate.tsx  —  src/components/world/CampaignCreationGate.tsx
 *
 * The campaign analog of WorldCreationGate: a dismissable overlay opened from
 * the sidebar's "New campaign" action, offering four ways to start a campaign
 * inside the active world:
 *   • scratch   — name + optional premise + party → createCampaign
 *   • template  — a prebuilt premise + party + starter threads
 *   • import    — parse a document → premise + seeded threads
 *   • ai        — draft a premise + threads with the Assistant
 *
 * On success it seeds any starter threads (hooks), closes, and opens the new
 * campaign — the campaign analog of the world gate landing you in the new world.
 * Reuses the fwg- styles from firstWorldGate.css.
 * ========================================================================== */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorld } from '../../context/WorldContext';
import { getAIProvider } from '../../lib/aiProvider';
import {
  extractClientSide, submitDocument, entityMeta, importSizeError, MAX_IMPORT_LABEL,
  passProgressText, READING_MESSAGE, EXTRACTING_MESSAGE, type ImportAction,
} from '../../lib/documentImport';
import {
  CAMPAIGN_TEMPLATES, templateCounts, seedCampaignHooks, seedCampaignEntities,
  summarizeSeedActions, type SeedHook,
} from '../../lib/campaignSeeds';
import { generateCampaignDraft, type CampaignDraft } from '../../lib/generateCampaign';
import { limitFor } from '../../lib/fieldLimits';
import { CharCounter } from '../ui/CharCounter';
import './firstWorldGate.css';

type Route = 'menu' | 'scratch' | 'template' | 'import' | 'ai';

const OPTIONS: { id: Route; glyph: string; color: string; title: string; desc: string }[] = [
  { id: 'scratch',  glyph: '✧',       color: 'var(--gold)',   title: 'Start from scratch',          desc: 'Name it and add a premise when you\'re ready.' },
  { id: 'template', glyph: '❧',       color: 'var(--moss)',   title: 'Use a template',              desc: 'Begin from a ready-made premise and a cast of threads.' },
  { id: 'import',   glyph: '❦︎', color: 'var(--sky)',    title: 'Import from a document',      desc: 'Turn session notes or a pitch doc into a campaign.' },
  { id: 'ai',       glyph: '✦',       color: 'var(--accent)', title: 'Generate with the Assistant', desc: 'Describe an idea and let it draft the premise.' },
];

const AI_SAMPLES = [
  'A heist crew pulling one last job in a city of clockwork gods',
  'Rival knightly orders racing to slay the same dragon',
  'Survivors rebuilding after all magic simply stopped working',
];

// The parse-document endpoint requires a non-empty campaignContext. A campaign
// created from the gate has no existing entities yet.
const NEW_CAMPAIGN_CONTEXT =
  '== EXISTING CAMPAIGN DATA ==\n\n(This is a brand-new, empty campaign with no existing entities. ' +
  'Treat every entity you extract as new — set "matched_id" to null for all of them.)';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

interface CampaignFields { party?: string; plot_summary?: string }

// What to seed into the new campaign after it's created. `actions` (the import
// path) seeds every entity kind the document produced; `hooks` (template/AI
// paths) seeds just starter threads.
interface CampaignSeed { hooks?: SeedHook[]; actions?: ImportAction[] }

/**
 * Create the campaign, seed its starter content, then close the overlay and
 * open the campaign. createCampaign runs inside the caller's try so DB errors
 * surface on the still-mounted gate; the close + open happen only on success.
 */
function useCreateCampaign(onClose: () => void) {
  const { createCampaign, openCampaign } = useWorld();
  return useCallback(async (name: string, fields?: CampaignFields, seed?: CampaignSeed) => {
    const campaign = await createCampaign(name, fields);
    try {
      if (seed?.actions && seed.actions.length) await seedCampaignEntities(campaign.id, seed.actions);
      else if (seed?.hooks && seed.hooks.length) await seedCampaignHooks(campaign.id, seed.hooks);
    } catch (e) {
      console.error('CampaignCreationGate: seeding failed', e);
    }
    onClose();
    openCampaign(campaign.id); // land the DM in the new campaign
    return campaign;
  }, [createCampaign, openCampaign, onClose]);
}

export default function CampaignCreationGate({ onClose }: { onClose: () => void }) {
  const { activeWorld } = useWorld();
  const [route, setRoute] = useState<Route>('menu');
  const back = () => setRoute('menu');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fwg-gate fwg-overlay" role="dialog" aria-modal="true" aria-label="Start a new campaign">
      <button className="fwg-close" onClick={onClose} aria-label="Close" title="Close">✕</button>

      {route === 'menu' && (
        <div className="fwg-col fwg-fade">
          <div className="fwg-head">
            <div className="fwg-crest" aria-hidden="true">❧</div>
            <div className="fwg-eyebrow">New campaign</div>
            <h1 className="fwg-title">Start a new campaign</h1>
            <p className="fwg-sub">
              A campaign is a story you run inside {activeWorld?.name ?? 'this world'}. Pick how you’d like
              to begin — you can change everything later.
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
            <button className="fwg-linkbtn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {route === 'scratch'  && <ScratchPanel  onBack={back} onClose={onClose} />}
      {route === 'template' && <TemplatePanel onBack={back} onClose={onClose} />}
      {route === 'import'   && <ImportPanel   onBack={back} onClose={onClose} />}
      {route === 'ai'       && <AiPanel       onBack={back} onClose={onClose} />}
    </div>
  );
}

interface PanelProps { onBack: () => void; onClose: () => void }

function BackBtn({ onBack }: { onBack: () => void }) {
  return <button className="fwg-back" onClick={onBack}>‹ All options</button>;
}

/* ── Path 1: scratch ─────────────────────────────────────────────────────── */
function ScratchPanel({ onBack, onClose }: PanelProps) {
  const createCampaign = useCreateCampaign(onClose);
  const [name, setName] = useState('');
  const [premise, setPremise] = useState('');
  const [party, setParty] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await createCampaign(name.trim(), { plot_summary: premise.trim() || undefined, party: party.trim() || undefined });
      // success → overlay closed + campaign opened; do not touch state here.
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  return (
    <div className="fwg-col fwg-fade" style={{ maxWidth: 540 }}>
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Name your campaign</h2>
      <p className="fwg-psub">You can rename it and change everything later — this is just a starting point.</p>
      <div className="fwg-field">
        <label className="fwg-label">Campaign name</label>
        <input ref={ref} className="fwg-inp" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          maxLength={limitFor('campaigns', 'name')}
          placeholder="e.g. The Gathering Storm" />
      </div>
      <div className="fwg-field">
        <label className="fwg-label">Premise <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
        <textarea className="fwg-inp" value={premise}
          onChange={e => setPremise(e.target.value)}
          placeholder="A sentence or two on the situation, the stakes, and what the party does." />
        <CharCounter value={premise} limit={limitFor('campaigns', 'plot_summary')} />
        <div className="fwg-hint">Shown on the campaign overview. Edit it anytime.</div>
      </div>
      <div className="fwg-field">
        <label className="fwg-label">Party <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
        <input className="fwg-inp" value={party}
          onChange={e => setParty(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          maxLength={limitFor('campaigns', 'party')}
          placeholder="e.g. Four level-3 adventurers from the Free Cities" />
        <div className="fwg-hint">A short line describing the party — shown on the overview. Add full character sheets later in Cast.</div>
      </div>
      {err && <div className="fwg-error">{err}</div>}
      <div className="fwg-btn-row">
        <button className="fwg-btn fwg-btn-primary" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create campaign'}
        </button>
        <button className="fwg-btn fwg-btn-ghost" onClick={onBack} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Path 2: template ────────────────────────────────────────────────────── */
function TemplatePanel({ onBack, onClose }: PanelProps) {
  const createCampaign = useCreateCampaign(onClose);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = CAMPAIGN_TEMPLATES.find(t => t.id === sel);

  const create = async () => {
    if (!chosen || busy) return;
    setBusy(true); setErr('');
    try {
      await createCampaign(chosen.name, { plot_summary: chosen.premise, party: chosen.party }, { hooks: chosen.hooks });
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  return (
    <div className="fwg-col fwg-fade">
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Choose a starting premise</h2>
      <p className="fwg-psub">A template comes with a premise, a party, and a few starter threads. Reshape any of it once you’re in.</p>
      <div className="fwg-ex-list">
        {CAMPAIGN_TEMPLATES.map(t => {
          const c = templateCounts(t);
          return (
            <button className={'fwg-ex' + (sel === t.id ? ' is-sel' : '')} key={t.id} onClick={() => setSel(t.id)}>
              <span className="fwg-ex-glyph" aria-hidden="true">❧</span>
              <span className="fwg-ex-body">
                <span className="fwg-ex-name">{t.name}</span>
                <span className="fwg-ex-tag">{t.pitch}</span>
                <span className="fwg-ex-meta">
                  <span>❧ {c.hooks} starter threads</span>
                </span>
              </span>
              <span className="fwg-ex-check" aria-hidden="true">{sel === t.id ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      {err && <div className="fwg-error">{err}</div>}
      <div className="fwg-btn-row">
        <button className="fwg-btn fwg-btn-primary" disabled={!chosen || busy} onClick={create}>
          {busy ? 'Creating…' : 'Create from this template'}
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
function nameFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stem.replace(/\b\w/g, c => c.toUpperCase());
}
function premiseFromSummary(summary: string): string {
  return summary.trim().length > 500 ? summary.trim().slice(0, 497).trimEnd() + '…' : summary.trim();
}

function ImportPanel({ onBack, onClose }: PanelProps) {
  const createCampaign = useCreateCampaign(onClose);
  const [stage, setStage] = useState<'drop' | 'staged' | 'reading' | 'ready'>('drop');
  const [name, setName] = useState('');
  const [premise, setPremise] = useState('');
  // Held from the moment a file is picked until reset() — staging (choosing a
  // file) is decoupled from starting the parse, so this survives staged →
  // reading → ready untouched; only startImport() and reset() ever branch on it.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [actions, setActions] = useState<ImportAction[]>([]);
  const [progress, setProgress] = useState(READING_MESSAGE);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // What the parsed document will create, grouped by entity kind for the DM.
  const seedSummary = summarizeSeedActions(actions);
  const seedTotal = seedSummary.reduce((n, s) => n + s.count, 0);

  /** Pick or drop a file — just stages it for review, doesn't parse it yet. */
  const stageFile = (f: File) => {
    const sizeError = importSizeError(f);
    if (sizeError) { setErr(sizeError); return; } // reject up front — stay on the drop screen
    setErr('');
    setPendingFile(f);
    setStage('staged');
  };

  /** DM clicked "Start import" — actually reads and parses the staged file. */
  const startImport = async () => {
    if (!pendingFile) return;
    const f = pendingFile;
    setErr('');
    setProgress(READING_MESSAGE);
    setWarnings([]);
    setStage('reading');
    const controller = new AbortController();
    abortRef.current = controller;
    // Prefer the campaign name + premise the model draws from the document's own
    // content (streamed via onTitle). Only fall back to the filename + parse
    // summary if the model never returned one. For campaign scope the derived
    // `tagline` field carries the premise.
    let titleReceived = false;
    try {
      const input = await extractClientSide(f);
      const { summary, actions: parsed } = await submitDocument(
        input, NEW_CAMPAIGN_CONTEXT, undefined,
        undefined,                                    // onText
        () => setProgress(EXTRACTING_MESSAGE),        // onExtracting
        p => setProgress(passProgressText(p)),        // onPass
        controller.signal, getAIProvider(), 'campaign',
        true,                                          // deriveTitle
        t => { titleReceived = true; setName(t.name); setPremise(t.tagline); }, // onTitle
        w => setWarnings(prev => [...prev, `${w.label}: ${w.message}`]),        // onWarning
      );
      setActions(parsed);
      if (!titleReceived) {
        setName(nameFromFilename(f.name));
        setPremise(premiseFromSummary(summary));
      }
      setStage('ready');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setErr(errMsg(e));
      setStage('staged'); // keep the staged file — let the DM retry without re-picking
    }
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await createCampaign(name.trim(), { plot_summary: premise.trim() || undefined }, { actions });
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setStage('drop'); setPendingFile(null); setName(''); setPremise(''); setActions([]);
    setProgress(READING_MESSAGE); setWarnings([]); setErr('');
  };

  return (
    <div className="fwg-col fwg-fade" style={{ maxWidth: 560 }}>
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Import from a document</h2>
      <p className="fwg-psub">Bring in session notes or a pitch doc. We’ll read it, pull out a premise, and stage any plot threads for review.</p>

      <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) stageFile(f); e.target.value = ''; }} />

      {stage === 'drop' && (
        <>
          <div
            className={'fwg-drop' + (dragging ? ' is-drag' : '')}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files?.[0]; if (f) stageFile(f);
            }}
          >
            <div className="fwg-drop-glyph" aria-hidden="true">❦{'︎'}</div>
            <div className="fwg-drop-title">Drop a file here, or <span style={{ color: 'var(--gold)' }}>browse</span></div>
            <div className="fwg-drop-sub">PDF · DOCX · MARKDOWN · TXT · MAX {MAX_IMPORT_LABEL}</div>
          </div>
          {err && <div className="fwg-error">{err}</div>}
        </>
      )}

      {stage === 'staged' && (
        <div className="fwg-fade">
          <div className="fwg-file-chip">
            <span className="fwg-file-chip-glyph" aria-hidden="true">❦{'︎'}</span>
            <span className="fwg-file-chip-name">{pendingFile?.name}</span>
            {pendingFile && <span className="fwg-file-chip-size">{prettySize(pendingFile.size)}</span>}
          </div>
          <p className="fwg-hint" style={{ margin: '10px 0 0' }}>
            Ready when you are — nothing's created yet. We'll read it, draft a premise, and stage anything it describes for your review.
          </p>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" onClick={startImport}>Start import</button>
            <button className="fwg-btn fwg-btn-ghost" onClick={reset}>Choose a different file</button>
          </div>
        </div>
      )}

      {stage === 'reading' && (
        <div>
          <div className="fwg-file-chip">
            <span className="fwg-file-chip-glyph" aria-hidden="true">❦{'︎'}</span>
            <span className="fwg-file-chip-name">{pendingFile?.name}</span>
            {pendingFile && <span className="fwg-file-chip-size">{prettySize(pendingFile.size)}</span>}
          </div>
          <div className="fwg-working" aria-live="polite"><span className="fwg-spinner" aria-hidden="true" />{progress}</div>
        </div>
      )}

      {stage === 'ready' && (
        <div className="fwg-fade">
          <div className="fwg-file-chip">
            <span className="fwg-file-chip-glyph" aria-hidden="true">❦{'︎'}</span>
            <span className="fwg-file-chip-name">{pendingFile?.name}</span>
            <span className="fwg-file-chip-read">✓ read</span>
          </div>
          <p className="fwg-hint" style={{ margin: '0 0 12px' }}>
            We drafted a premise{seedTotal > 0 ? `, plus ${seedTotal} ${seedTotal === 1 ? 'entry' : 'entries'} to seed` : ''}. Edit anything before creating.
          </p>
          {warnings.length > 0 && (
            <div className="fwg-warn">
              Couldn't fully read {warnings.length === 1 ? 'one category' : `${warnings.length} categories`} — results below may be thinner than expected:
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {seedSummary.length > 0 && (
            <div className="fwg-seeds" style={{ margin: '0 0 16px' }}>
              {seedSummary.map(s => (
                <div className="fwg-seed" key={s.type}>
                  <span className="fwg-seed-glyph" aria-hidden="true">{entityMeta[s.type].glyph}</span>
                  {s.count} {s.label}{s.count === 1 ? '' : 's'}
                </div>
              ))}
            </div>
          )}
          <div className="fwg-field">
            <label className="fwg-label">Campaign name</label>
            <input className="fwg-inp" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create(); }} maxLength={limitFor('campaigns', 'name')} />
          </div>
          <div className="fwg-field">
            <label className="fwg-label">Premise</label>
            <textarea className="fwg-inp" value={premise} onChange={e => setPremise(e.target.value)} />
            <CharCounter value={premise} limit={limitFor('campaigns', 'plot_summary')} />
          </div>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" disabled={!name.trim() || busy} onClick={create}>
              {busy ? 'Creating…' : 'Create campaign'}
            </button>
            <button className="fwg-btn fwg-btn-ghost" onClick={reset} disabled={busy}>Choose another file</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Path 4: generate with the Assistant ─────────────────────────────────── */
function AiPanel({ onBack, onClose }: PanelProps) {
  const createCampaign = useCreateCampaign(onClose);
  const [prompt, setPrompt] = useState('');
  const [stage, setStage] = useState<'prompt' | 'working' | 'result'>('prompt');
  const [result, setResult] = useState<CampaignDraft | null>(null);
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
      const draft = await generateCampaignDraft(prompt.trim(), controller.signal);
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
      await createCampaign(result.name, { plot_summary: result.premise || undefined, party: result.party || undefined }, { hooks: result.hooks });
    } catch (e) {
      setBusy(false);
      setErr(errMsg(e));
    }
  };

  return (
    <div className="fwg-col fwg-fade" style={{ maxWidth: 560 }}>
      <BackBtn onBack={onBack} />
      <h2 className="fwg-h">Describe your campaign</h2>
      <p className="fwg-psub">A sentence or two is plenty. The Assistant drafts a premise, a party, and a handful of starter threads you can keep or discard.</p>

      {stage !== 'result' && (
        <div className="fwg-field">
          <label className="fwg-label">Your idea</label>
          <textarea className="fwg-inp" value={prompt} onChange={e => setPrompt(e.target.value)}
            disabled={stage === 'working'}
            placeholder="e.g. A heist crew pulling one last job in a city of clockwork gods…" />
          <div className="fwg-chips">
            {AI_SAMPLES.map((s, i) => <button className="fwg-chip" key={i} onClick={() => setPrompt(s)} disabled={stage === 'working'}>{s}</button>)}
          </div>
        </div>
      )}
      {stage === 'prompt' && (
        <>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" disabled={!prompt.trim()} onClick={gen}>✦ Generate campaign</button>
            <button className="fwg-btn fwg-btn-ghost" onClick={onBack}>Cancel</button>
          </div>
        </>
      )}
      {stage === 'working' && <div className="fwg-working"><span className="fwg-spinner" aria-hidden="true" />Drafting your campaign…</div>}
      {stage === 'result' && result && (
        <div className="fwg-fade">
          <div className="fwg-result">
            <div className="fwg-result-eyebrow">✦ Draft</div>
            <div className="fwg-result-name">{result.name}</div>
            {result.premise && <div className="fwg-result-tag" style={{ fontStyle: 'normal' }}>{result.premise}</div>}
            {result.party && <div className="fwg-seed" style={{ marginTop: 6 }}><span className="fwg-seed-glyph" aria-hidden="true">◈</span>{result.party}</div>}
            {result.summaryLines.length > 0 && (
              <div className="fwg-seeds" style={{ marginTop: 10 }}>
                {result.summaryLines.map((s, i) => (
                  <div className="fwg-seed" key={i}><span className="fwg-seed-glyph" aria-hidden="true">{s.glyph}</span>{s.text}</div>
                ))}
              </div>
            )}
          </div>
          {err && <div className="fwg-error">{err}</div>}
          <div className="fwg-btn-row">
            <button className="fwg-btn fwg-btn-primary" disabled={busy} onClick={create}>
              {busy ? 'Creating…' : 'Create campaign'}
            </button>
            <button className="fwg-btn fwg-btn-ghost" disabled={busy} onClick={() => { setStage('prompt'); setResult(null); }}>↺ Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}
