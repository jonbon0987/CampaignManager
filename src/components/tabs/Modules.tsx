import { useState } from 'react';
import { SlashField } from '../ui/SlashField';
// useRef kept for ModuleCreatePanel textarea refs
import { useCampaign } from '../../context/CampaignContext';
import { FormField, inputStyle } from '../FormField';
import { Button } from '../ui/Button';
import type { Module, Faction } from '../../lib/database.types';
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

const FACTION_TYPE_COLORS: Record<string, string> = {
  guild: 'var(--gold)', government: '#70a0e0', religious: '#d0c060',
  criminal: '#e05c5c', military: '#60b0a0', arcane: '#b080e0',
  merchant: '#e09050', other: 'var(--ink-2)',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
};

// ─── module list ──────────────────────────────────────────────────────────────

function ModuleList() {
  const { modules, upsertModule, factions } = useCampaign();

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);


  const selectedModule = modules.find(m => m.id === selectedModuleId);
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
          <button className="cm-md-add" onClick={() => { setCreating(true); setSelectedModuleId(null); }}>+ Add</button>
        </div>
        <div className="cm-md-list-scroll">
          {modules.length === 0 ? (
            <div className="cm-empty">No modules yet.</div>
          ) : sortedModules.map(mod => {
            const isActive = selectedModuleId === mod.id;
            const faction = mod.faction_id ? factions.find(f => f.id === mod.faction_id) : null;
            const fColor = faction ? (FACTION_TYPE_COLORS[faction.faction_type ?? 'other'] ?? 'var(--ink-2)') : null;
            return (
              <button
                key={mod.id}
                className={`cm-row ${isActive ? 'is-active' : ''}`}
                onClick={() => setSelectedModuleId(mod.id)}
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

      {/* Detail panel */}
      <div className="cm-md-detail">
        {creating ? (
          <ModuleCreatePanel
            factions={factions}
            onCancel={() => setCreating(false)}
            onCreate={async (form) => {
              await upsertModule({ ...form, played_session: null });
              setCreating(false);
            }}
          />
        ) : selectedModule ? (
          <ModuleDetail
            module={selectedModule}
            onBack={() => setSelectedModuleId(null)}
            onModuleDeleted={() => setSelectedModuleId(null)}
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
            <input type="text" value={form.chapter ?? ''} onChange={e => setForm(p => ({ ...p, chapter: e.target.value }))} placeholder="e.g., 1" style={inputStyle} autoFocus />
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
          <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., The Train Heist" style={inputStyle} />
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
          <SlashField value={form.synopsis ?? ''} onChange={v => setForm(p => ({ ...p, synopsis: v }))} placeholder="Overview of this chapter's events…" minHeight="80px" />
        </FormField>
        <FormField label="Encounters & Story Beats">
          <SlashField value={form.encounters ?? ''} onChange={v => setForm(p => ({ ...p, encounters: v }))} placeholder="Key scenes, encounters…" minHeight="100px" />
        </FormField>
        <FormField label="DM Notes">
          <SlashField value={form.dm_notes ?? ''} onChange={v => setForm(p => ({ ...p, dm_notes: v }))} placeholder="Hidden info, fallbacks…" minHeight="60px" />
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

export default function Modules({ viewMode = 'list' }: { viewMode?: string; setViewMode?: (v: string) => void }) {
  return (
    <div style={{ height: '100%', overflow: viewMode === 'list' ? 'auto' : 'hidden' }}>
      {viewMode === 'list' && <ModuleList />}
      {viewMode === 'web'  && <ModuleWeb />}
    </div>
  );
}
