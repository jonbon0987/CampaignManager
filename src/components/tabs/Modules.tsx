import { useState, useRef } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import type { DependencyType, Module } from '../../lib/database.types';
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

type PendingDep = {
  prerequisite_id: string;
  dependency_type: DependencyType;
  group_id: string | null;
  label: string | null;
};

const emptyModuleForm = (): ModuleForm => ({
  chapter: '', title: '', synopsis: '', encounters: '', rewards: '', dm_notes: '', status: 'planned',
  faction_id: null, node_role: null,
});

const statusBadgeColor: Record<Module['status'], 'blue' | 'green' | 'muted'> = {
  planned: 'blue', active: 'green', completed: 'muted',
};

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

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--ink-3)',
  fontFamily: 'var(--mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

// ─── module list ──────────────────────────────────────────────────────────────

function ModuleList() {
  const {
    modules, upsertModule, moduleDeps,
    upsertModuleDep, selectedCampaignId, factions,
  } = useCampaign();

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleForm, setModuleForm] = useState<ModuleForm>(emptyModuleForm());

  // Textarea refs for entity link toolbar
  const newSynopsisRef = useRef<HTMLTextAreaElement>(null);
  const newEncountersRef = useRef<HTMLTextAreaElement>(null);
  const newRewardsRef = useRef<HTMLTextAreaElement>(null);
  const newDmNotesRef = useRef<HTMLTextAreaElement>(null);

  // pending dependencies for the create modal
  const [pendingDeps, setPendingDeps] = useState<PendingDep[]>([]);
  const [depAddOpen, setDepAddOpen] = useState(false);
  const [depAddForm, setDepAddForm] = useState<{ prerequisite_id: string; dependency_type: DependencyType; label: string }>({
    prerequisite_id: '', dependency_type: 'required', label: '',
  });

  const openAddModule = () => {
    setModuleForm(emptyModuleForm());
    setPendingDeps([]);
    setDepAddOpen(false);
    setDepAddForm({ prerequisite_id: '', dependency_type: 'required', label: '' });
    setModuleModalOpen(true);
  };

  const handleCreateModule = async () => {
    const newMod = await upsertModule({ ...moduleForm, played_session: null });
    if (newMod && pendingDeps.length > 0 && selectedCampaignId) {
      for (const dep of pendingDeps) {
        await upsertModuleDep({ campaign_id: selectedCampaignId, dependent_id: newMod.id, ...dep });
      }
    }
    setPendingDeps([]);
    setModuleModalOpen(false);
  };

  const addPendingDep = () => {
    if (!depAddForm.prerequisite_id) return;
    setPendingDeps(prev => [...prev, {
      prerequisite_id: depAddForm.prerequisite_id,
      dependency_type: depAddForm.dependency_type,
      group_id: depAddForm.dependency_type === 'optional' ? crypto.randomUUID() : null,
      label: depAddForm.label || null,
    }]);
    setDepAddForm({ prerequisite_id: '', dependency_type: 'required', label: '' });
    setDepAddOpen(false);
  };

  const removePendingDep = (idx: number) => {
    setPendingDeps(prev => prev.filter((_, i) => i !== idx));
  };

  // already-added prereq IDs (to exclude from the dep add select)
  const pendingPrereqIds = new Set(pendingDeps.map(d => d.prerequisite_id));
  const availableForDep = modules.filter(m => !pendingPrereqIds.has(m.id));

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
          <button className="cm-md-add" onClick={openAddModule}>+ Add</button>
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
        {selectedModule ? (
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

      {/* create module modal */}
      <Modal isOpen={moduleModalOpen} onClose={() => setModuleModalOpen(false)} title="New Module" onSave={handleCreateModule} wide>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Module ID"><input type="text" value={moduleForm.chapter ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, chapter: e.target.value }))} placeholder="e.g., 1" style={inputStyle} /></FormField>
          <FormField label="Status">
            <select value={moduleForm.status} onChange={e => setModuleForm(prev => ({ ...prev, status: e.target.value as Module['status'] }))} style={inputStyle}>
              <option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option>
            </select>
          </FormField>
        </div>
        <FormField label="Name"><input type="text" value={moduleForm.title} onChange={e => setModuleForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g., The Train Heist" style={inputStyle} /></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Faction / Storyline">
            <select value={moduleForm.faction_id ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, faction_id: e.target.value || null }))} style={selectStyle}>
              <option value="">-- No Faction --</option>
              {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormField>
          <FormField label="Node Role">
            <select value={moduleForm.node_role ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, node_role: (e.target.value || null) as 'start' | 'boss' | null }))} style={selectStyle}>
              <option value="">Normal</option>
              <option value="start">Starting Mission</option>
              <option value="boss">Final Boss</option>
            </select>
          </FormField>
        </div>
        <FormField label="Synopsis">
          <MarkdownEditor value={moduleForm.synopsis ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, synopsis: v }))} placeholder="Overview of this chapter's events…" minHeight="80px" textareaRef={newSynopsisRef} />
          <EntityLinkToolbar textareaRef={newSynopsisRef} onInsert={markup => setModuleForm(prev => ({ ...prev, synopsis: insertAtCursor(newSynopsisRef, prev.synopsis ?? '', markup) }))} />
        </FormField>
        <FormField label="Encounters">
          <MarkdownEditor value={moduleForm.encounters ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, encounters: v }))} placeholder="Key scenes, encounters…" minHeight="120px" textareaRef={newEncountersRef} />
          <EntityLinkToolbar textareaRef={newEncountersRef} onInsert={markup => setModuleForm(prev => ({ ...prev, encounters: insertAtCursor(newEncountersRef, prev.encounters ?? '', markup) }))} />
        </FormField>
        <FormField label="Rewards">
          <MarkdownEditor value={moduleForm.rewards ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, rewards: v }))} placeholder="Loot, level-ups…" minHeight="60px" textareaRef={newRewardsRef} />
          <EntityLinkToolbar textareaRef={newRewardsRef} onInsert={markup => setModuleForm(prev => ({ ...prev, rewards: insertAtCursor(newRewardsRef, prev.rewards ?? '', markup) }))} />
        </FormField>
        <FormField label="DM Notes">
          <MarkdownEditor value={moduleForm.dm_notes ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, dm_notes: v }))} placeholder="Hidden info, fallbacks…" minHeight="60px" textareaRef={newDmNotesRef} />
          <EntityLinkToolbar textareaRef={newDmNotesRef} onInsert={markup => setModuleForm(prev => ({ ...prev, dm_notes: insertAtCursor(newDmNotesRef, prev.dm_notes ?? '', markup) }))} />
        </FormField>

        {/* prerequisites section */}
        {modules.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Prerequisites (optional)
              </span>
              {!depAddOpen && (
                <button
                  onClick={() => setDepAddOpen(true)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--rule-soft)', color: 'var(--gold)', border: '1px solid #3a3660', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a3860')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--rule-soft)')}
                >
                  ＋ Add
                </button>
              )}
            </div>

            {/* pending dep chips */}
            {pendingDeps.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingDeps.map((dep, idx) => {
                  const mod = modules.find(m => m.id === dep.prerequisite_id);
                  const label = mod ? (mod.chapter ? `${mod.chapter}: ` : '') + mod.title : dep.prerequisite_id;
                  return (
                    <span
                      key={idx}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: '#0d0c1a', border: '1px solid #3a3660', color: 'var(--ink)' }}
                    >
                      {label}
                      <span style={{ color: dep.dependency_type === 'optional' ? 'var(--gold)' : 'var(--ink-2)' }}>
                        · {dep.dependency_type}
                      </span>
                      <button
                        onClick={() => removePendingDep(idx)}
                        style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#e05c5c')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* inline dep add row */}
            {depAddOpen && (
              <div className="flex flex-col gap-2 p-3 rounded" style={{ backgroundColor: '#0d0c1a', border: '1px solid #3a3660' }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block mb-1" style={labelStyle}>Module</label>
                    <select
                      value={depAddForm.prerequisite_id}
                      onChange={e => setDepAddForm(f => ({ ...f, prerequisite_id: e.target.value }))}
                      style={selectStyle}
                    >
                      <option value="">— select —</option>
                      {availableForDep.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.chapter ? `${m.chapter}: ` : ''}{m.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1" style={labelStyle}>Type</label>
                    <select
                      value={depAddForm.dependency_type}
                      onChange={e => setDepAddForm(f => ({ ...f, dependency_type: e.target.value as DependencyType }))}
                      style={selectStyle}
                    >
                      <option value="required">Required (AND)</option>
                      <option value="optional">Optional (OR)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block mb-1" style={labelStyle}>Label (optional)</label>
                  <input
                    type="text"
                    value={depAddForm.label}
                    onChange={e => setDepAddForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="e.g. after completing rescue…"
                    style={inputStyle}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addPendingDep}
                    disabled={!depAddForm.prerequisite_id}
                    className="text-xs px-3 py-1 rounded disabled:opacity-40"
                    style={{ backgroundColor: '#a07830', color: 'var(--ink)', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--gold)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setDepAddOpen(false); setDepAddForm({ prerequisite_id: '', dependency_type: 'required', label: '' }); }}
                    className="text-xs px-3 py-1 rounded"
                    style={{ color: 'var(--ink-2)', border: '1px solid #3a3660', background: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-2)')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
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
