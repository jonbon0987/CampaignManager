import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import type { DependencyType, Module } from '../../lib/database.types';
import ModuleDetail from './ModuleDetail';
import ModuleWeb from './ModuleWeb';

// ─── types ────────────────────────────────────────────────────────────────────

type SubTab = 'list' | 'web';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'list', label: 'Module List' },
  { id: 'web',  label: 'Module Web' },
];

type ModuleForm = {
  chapter: string | null;
  title: string;
  synopsis: string | null;
  encounters: string | null;
  rewards: string | null;
  dm_notes: string | null;
  status: Module['status'];
};

type PendingDep = {
  prerequisite_id: string;
  dependency_type: DependencyType;
  group_id: string | null;
  label: string | null;
};

const emptyModuleForm = (): ModuleForm => ({
  chapter: '', title: '', synopsis: '', encounters: '', rewards: '', dm_notes: '', status: 'planned',
});

const statusBadgeColor: Record<Module['status'], 'blue' | 'green' | 'muted'> = {
  planned: 'blue', active: 'green', completed: 'muted',
};

const inputEditStyle: React.CSSProperties = {
  backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660',
  fontFamily: 'Georgia, Cambria, serif', fontSize: '0.875rem', borderRadius: '0.375rem',
  padding: '0.375rem 0.5rem', width: '100%',
};

const labelStyle: React.CSSProperties = {
  color: '#c9a84c', fontSize: '0.65rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
};

// ─── module list ──────────────────────────────────────────────────────────────

function ModuleList() {
  const {
    modules, upsertModule, submodules, moduleSheets, moduleDeps,
    upsertModuleDep, selectedCampaignId,
  } = useCampaign();

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleForm, setModuleForm] = useState<ModuleForm>(emptyModuleForm());

  // inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ chapter: string; title: string; status: Module['status'] } | null>(null);
  const [saving, setSaving] = useState(false);

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

  const startEdit = (mod: Module) => {
    setEditingId(mod.id);
    setEditForm({ chapter: mod.chapter ?? '', title: mod.title, status: mod.status });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    const mod = modules.find(m => m.id === editingId);
    if (!mod) return;
    setSaving(true);
    await upsertModule({
      id: editingId,
      chapter: editForm.chapter || null,
      title: editForm.title,
      status: editForm.status,
      synopsis: mod.synopsis,
      encounters: mod.encounters,
      rewards: mod.rewards,
      dm_notes: mod.dm_notes,
      played_session: mod.played_session,
    });
    setSaving(false);
    cancelEdit();
  };

  // already-added prereq IDs (to exclude from the dep add select)
  const pendingPrereqIds = new Set(pendingDeps.map(d => d.prerequisite_id));
  const availableForDep = modules.filter(m => !pendingPrereqIds.has(m.id));

  const selectedModule = modules.find(m => m.id === selectedModuleId);
  if (selectedModule) {
    return (
      <ModuleDetail
        module={selectedModule}
        onBack={() => setSelectedModuleId(null)}
        onModuleDeleted={() => setSelectedModuleId(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl">
      <SectionHeader
        title="Modules"
        subtitle={`${modules.length} module${modules.length !== 1 ? 's' : ''}`}
        onAdd={openAddModule}
        addLabel="Add Module"
      />

      {modules.length === 0 ? (
        <EmptyState message="No modules yet. Add your first campaign chapter!" onAdd={openAddModule} addLabel="Add Module" />
      ) : (
        <div className="space-y-3">
          {[...modules].sort((a, b) => {
            const aId = a.chapter ? parseFloat(a.chapter) : Infinity;
            const bId = b.chapter ? parseFloat(b.chapter) : Infinity;
            return aId - bId;
          }).map(mod => {
            const isEditing = editingId === mod.id;
            const modSubmodules = submodules.filter(s => s.module_id === mod.id);
            const modSheets = moduleSheets.filter(s => s.module_id === mod.id);
            const prereqCount = moduleDeps.filter(d => d.dependent_id === mod.id).length;
            const blockerCount = moduleDeps.filter(d => d.prerequisite_id === mod.id).length;

            return (
              <div
                key={mod.id}
                className="rounded-lg border p-4 flex items-center gap-4 transition-colors duration-150"
                style={{
                  backgroundColor: '#1a1828',
                  borderColor: isEditing ? '#c9a84c' : '#2e2c4a',
                }}
              >
                {isEditing && editForm ? (
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Module ID</label>
                        <input type="number" value={editForm.chapter} onChange={e => setEditForm(prev => prev ? { ...prev, chapter: e.target.value } : prev)} autoFocus style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Name</label>
                        <input type="text" value={editForm.title} onChange={e => setEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)} style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Status</label>
                        <select value={editForm.status} onChange={e => setEditForm(prev => prev ? { ...prev, status: e.target.value as Module['status'] } : prev)} style={inputEditStyle}>
                          <option value="planned">Planned</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {mod.chapter && (
                      <div className="text-3xl font-bold shrink-0 w-10 text-center" style={{ color: '#3a3660', fontFamily: 'Georgia, Cambria, serif' }}>
                        {mod.chapter}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif' }}>
                        {mod.chapter ? `${mod.chapter}: ` : ''}{mod.title || 'Untitled'}
                      </h3>
                      {mod.synopsis && (
                        <p className="text-sm mt-0.5" style={{ color: '#9990b0', lineHeight: '1.5' }}>
                          {mod.synopsis.substring(0, 120)}{mod.synopsis.length > 120 ? '…' : ''}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge label={mod.status} color={statusBadgeColor[mod.status]} size="xs" />
                        {modSubmodules.length > 0 && <Badge label={`${modSubmodules.length} submodule${modSubmodules.length !== 1 ? 's' : ''}`} color="gold" size="xs" />}
                        {modSheets.length > 0 && <Badge label={`${modSheets.length} sheet${modSheets.length !== 1 ? 's' : ''}`} color="muted" size="xs" />}
                        {prereqCount > 0 && <Badge label={`${prereqCount} prereq${prereqCount !== 1 ? 's' : ''}`} color="blue" size="xs" />}
                        {blockerCount > 0 && <Badge label={`blocks ${blockerCount}`} color="green" size="xs" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(mod)} title="Edit">
                        <Pencil size={14} strokeWidth={1.5} />
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => setSelectedModuleId(mod.id)}>
                        Open →
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

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
        <FormField label="Synopsis"><textarea value={moduleForm.synopsis ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, synopsis: e.target.value }))} placeholder="Overview of this chapter's events…" style={{ ...textareaStyle, minHeight: '80px' }} /></FormField>
        <FormField label="Encounters"><textarea value={moduleForm.encounters ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, encounters: e.target.value }))} placeholder="Key scenes, encounters…" style={{ ...textareaStyle, minHeight: '120px' }} /></FormField>
        <FormField label="Rewards"><textarea value={moduleForm.rewards ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, rewards: e.target.value }))} placeholder="Loot, level-ups…" style={{ ...textareaStyle, minHeight: '60px' }} /></FormField>
        <FormField label="DM Notes"><textarea value={moduleForm.dm_notes ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, dm_notes: e.target.value }))} placeholder="Hidden info, fallbacks…" style={{ ...textareaStyle, minHeight: '60px' }} /></FormField>

        {/* prerequisites section */}
        {modules.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: '#9990b0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Prerequisites (optional)
              </span>
              {!depAddOpen && (
                <button
                  onClick={() => setDepAddOpen(true)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: '#2a2840', color: '#c9a84c', border: '1px solid #3a3660', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a3860')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2a2840')}
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
                      style={{ backgroundColor: '#0d0c1a', border: '1px solid #3a3660', color: '#e8d5b0' }}
                    >
                      {label}
                      <span style={{ color: dep.dependency_type === 'optional' ? '#c9a84c' : '#9990b0' }}>
                        · {dep.dependency_type}
                      </span>
                      <button
                        onClick={() => removePendingDep(idx)}
                        style={{ background: 'none', border: 'none', color: '#6a6490', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#e05c5c')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
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
                    style={{ backgroundColor: '#a07830', color: '#e8d5b0', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setDepAddOpen(false); setDepAddForm({ prerequisite_id: '', dependency_type: 'required', label: '' }); }}
                    className="text-xs px-3 py-1 rounded"
                    style={{ color: '#9990b0', border: '1px solid #3a3660', background: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
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

// ─── shell with sub-tabs ──────────────────────────────────────────────────────

export default function Modules() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('list');

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? '#2a2840' : 'transparent',
    color: active ? '#c9a84c' : '#9990b0',
    transition: 'all 0.15s',
    fontFamily: 'Georgia, Cambria, serif',
  });

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 p-1 rounded-lg mb-5 self-start" style={{ backgroundColor: '#12111e' }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={pillStyle(activeSubTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeSubTab === 'list' && <ModuleList />}
        {activeSubTab === 'web'  && <ModuleWeb />}
      </div>
    </div>
  );
}
