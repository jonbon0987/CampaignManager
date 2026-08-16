/* ════════════════════════════════════════════════════════════════
   Modules.tsx — patched for the Atlas redesign.
   - The Modules shell now owns "which module is open". When one is
     open it renders <ModuleDetail> full-bleed (the module "takes
     over" the area as [outline rail | editor]) — reachable from BOTH
     the list and the web view. ModuleDetail's "‹ Modules" breadcrumb
     calls onBack to return.
   - ModuleList is now a pure list + create panel; a row click (or
     finishing the create form) calls onOpen(id).
   - ModuleWeb gets the same onOpen, so "Open in editor →" / a node
     double-click jumps straight into the Atlas editor.
   ════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { SlashField } from '../ui/SlashField';
import { limitFor } from '../../lib/fieldLimits';
import { useCampaign } from '../../context/CampaignContext';
import { FormField, inputStyle } from '../FormField';
import { Button } from '../ui/Button';
import type { Module, Faction } from '../../lib/database.types';
import { factionTypeColors } from '../../lib/theme';
import ModuleDetail from './ModuleDetail';
import ModuleWeb from './ModuleWeb';

// ─── types ────────────────────────────────────────────────────────────────────

type ModuleForm = {
  chapter: string | null;
  title: string;
  synopsis: string | null;
  encounters: string | null;
  rewards: string | null;
  dm_notes: string | null;
  status: Module['status'];
  faction_id: string | null;
  node_role: 'start' | 'boss' | null;
};

const emptyModuleForm = (): ModuleForm => ({
  chapter: '', title: '', synopsis: '', encounters: '', rewards: '', dm_notes: '', status: 'planned',
  faction_id: null, node_role: null,
});

// Derived from the single canonical taxonomy in lib/theme.ts (text swatch only).
const FACTION_TYPE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(factionTypeColors).map(([k, v]) => [k, v.text]),
);

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
};

// ─── module list ──────────────────────────────────────────────────────────────

function ModuleList({ onOpen }: { onOpen: (id: string) => void }) {
  const { modules, upsertModule, factions } = useCampaign();

  const [creating, setCreating] = useState(false);

  const sortedModules = [...modules].sort((a, b) => {
    const aId = a.chapter ? parseFloat(a.chapter) : Infinity;
    const bId = b.chapter ? parseFloat(b.chapter) : Infinity;
    return aId - bId;
  });

  return (
    <div className="cm-md" style={{ height: '100%' }}>
      {/* Left rail */}
      <div className="cm-md-list">
        <div className="cm-md-list-head">
          <div>
            <div className="cm-md-eyebrow">Campaign</div>
            <div className="cm-md-title">Modules</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>+ Add</Button>
        </div>
        <div className="cm-md-list-scroll">
          {modules.length === 0 ? (
            <div className="cm-empty">No modules yet.</div>
          ) : sortedModules.map(mod => {
            const faction = mod.faction_id ? factions.find(f => f.id === mod.faction_id) : null;
            const fColor = faction ? (FACTION_TYPE_COLORS[faction.faction_type ?? 'other'] ?? 'var(--ink-2)') : null;
            return (
              <button
                key={mod.id}
                className="cm-row"
                onClick={() => onOpen(mod.id)}
              >
                <span className="cm-row-glyph">❧</span>
                <span className="cm-row-body">
                  <span className="cm-row-title">
                    {mod.chapter ? `${mod.chapter}. ` : ''}{mod.title || 'Untitled'}
                  </span>
                  <span className="cm-row-sub">
                    {mod.status.charAt(0).toUpperCase() + mod.status.slice(1)}
                    {faction ? ` · ${faction.name}` : ''}
                  </span>
                  {fColor && (
                    <span className="cm-row-badges">
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: fColor }} />
                    </span>
                  )}
                </span>
                <span className="cm-row-meta" style={{ color: mod.status === 'active' ? 'var(--gold)' : mod.status === 'completed' ? 'var(--moss)' : 'var(--ink-3)' }}>
                  {mod.status === 'active' ? '●' : mod.status === 'completed' ? '✓' : '○'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel — create form or empty state (open modules take over above) */}
      <div className="cm-md-detail">
        {creating ? (
          <ModuleCreatePanel
            factions={factions}
            onCancel={() => setCreating(false)}
            onCreate={async (form) => {
              const created = await upsertModule({ ...form, played_session: null });
              setCreating(false);
              if (created?.id) onOpen(created.id);
            }}
          />
        ) : (
          <div className="cm-empty" style={{ paddingTop: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>❧</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--ink-2)' }}>Select a module</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>Choose from the list to view details.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── inline create panel ──────────────────────────────────────────────────────

function ModuleCreatePanel({
  factions,
  onCancel,
  onCreate,
}: {
  factions: Faction[];
  onCancel: () => void;
  onCreate: (form: ModuleForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ModuleForm>(emptyModuleForm());
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
  };

  return (
    <div className="cm-detail">
      <div className="cm-detail-head">
        <div className="cm-detail-eyebrow">Module</div>
        <h2 className="cm-detail-title">New Module</h2>
      </div>
      <div className="cm-detail-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Module ID">
            <input type="text" value={form.chapter ?? ''} onChange={e => setForm(p => ({ ...p, chapter: e.target.value }))} placeholder="e.g., 1" maxLength={limitFor('modules', 'chapter')} style={inputStyle} autoFocus />
          </FormField>
          <FormField label="Status">
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Module['status'] }))} style={inputStyle}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </FormField>
        </div>
        <FormField label="Name">
          <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., The Train Heist" maxLength={limitFor('modules', 'title')} style={inputStyle} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Faction / Storyline">
            <select value={form.faction_id ?? ''} onChange={e => setForm(p => ({ ...p, faction_id: e.target.value || null }))} style={selectStyle}>
              <option value="">-- No Faction --</option>
              {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormField>
          <FormField label="Node Role">
            <select value={form.node_role ?? ''} onChange={e => setForm(p => ({ ...p, node_role: (e.target.value || null) as 'start' | 'boss' | null }))} style={selectStyle}>
              <option value="">Normal</option>
              <option value="start">Starting Mission</option>
              <option value="boss">Final Boss</option>
            </select>
          </FormField>
        </div>
        <FormField label="Synopsis">
          <SlashField value={form.synopsis ?? ''} onChange={v => setForm(p => ({ ...p, synopsis: v }))} placeholder="Overview of this chapter's events…" minHeight="80px" maxLength={limitFor('modules', 'synopsis')} />
        </FormField>
        <FormField label="Encounters & Story Beats">
          <SlashField value={form.encounters ?? ''} onChange={v => setForm(p => ({ ...p, encounters: v }))} placeholder="Key scenes, encounters…" minHeight="100px" maxLength={limitFor('modules', 'encounters')} />
        </FormField>
        <FormField label="DM Notes">
          <SlashField value={form.dm_notes ?? ''} onChange={v => setForm(p => ({ ...p, dm_notes: v }))} placeholder="Hidden info, fallbacks…" minHeight="60px" maxLength={limitFor('modules', 'dm_notes')} />
        </FormField>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={!form.title.trim() || saving}>{saving ? 'Creating…' : 'Create Module'}</Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── shell ────────────────────────────────────────────────────────────────────

export default function Modules({ viewMode = 'list', setViewMode }: { viewMode?: string; setViewMode?: (v: string) => void }) {
  const { modules } = useCampaign();
  const [openId, setOpenId] = useState<string | null>(null);
  const openModule = openId ? modules.find(m => m.id === openId) ?? null : null;

  // Opening a module from the web jumps to the full editor — leave the web view
  // so the editor (which takes over) actually shows instead of staying on the web.
  const openInEditor = (id: string) => { setOpenId(id); if (viewMode === 'web') setViewMode?.('list'); };

  // An open module takes over the whole area as [outline rail | editor] — EXCEPT
  // in the web view, where an open module instead drills the graph into its
  // submodules (so "Dependencies" with a module open shows that module's web).
  if (openModule && viewMode !== 'web') {
    return (
      <ModuleDetail
        module={openModule}
        onBack={() => setOpenId(null)}
        onModuleDeleted={() => setOpenId(null)}
      />
    );
  }

  return (
    <div style={{ height: '100%', overflow: viewMode === 'list' ? 'auto' : 'hidden' }}>
      {viewMode === 'list' && <ModuleList onOpen={setOpenId} />}
      {viewMode === 'web'  && <ModuleWeb onOpen={openInEditor} initialModuleId={openId} />}
    </div>
  );
}
