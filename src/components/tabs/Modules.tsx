import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import type { Module } from '../../lib/database.types';
import ModuleDetail from './ModuleDetail';

type ModuleForm = {
  chapter: string | null;
  title: string;
  synopsis: string | null;
  encounters: string | null;
  rewards: string | null;
  dm_notes: string | null;
  status: Module['status'];
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

export default function Modules() {
  const { modules, upsertModule, submodules, moduleSheets } = useCampaign();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleForm, setModuleForm] = useState<ModuleForm>(emptyModuleForm());
  // Inline edit state for list rows
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ chapter: string; title: string; status: Module['status'] } | null>(null);
  const [saving, setSaving] = useState(false);

  const openAddModule = () => { setModuleForm(emptyModuleForm()); setModuleModalOpen(true); };

  const handleCreateModule = async () => {
    await upsertModule({ ...moduleForm, played_session: null });
    setModuleModalOpen(false);
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

  // If a module is selected, show detail
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
          {modules.map(mod => {
            const isEditing = editingId === mod.id;
            const modSubmodules = submodules.filter(s => s.module_id === mod.id);
            const modSheets = moduleSheets.filter(s => s.module_id === mod.id);

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
                  /* Inline edit row */
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Chapter</label>
                        <input type="text" value={editForm.chapter} onChange={e => setEditForm(prev => prev ? { ...prev, chapter: e.target.value } : prev)} autoFocus style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Title</label>
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
                    {/* Chapter number */}
                    {mod.chapter && (
                      <div className="text-3xl font-bold shrink-0 w-10 text-center" style={{ color: '#3a3660', fontFamily: 'Georgia, Cambria, serif' }}>
                        {mod.chapter}
                      </div>
                    )}

                    {/* Title + synopsis */}
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
                      </div>
                    </div>

                    {/* Actions */}
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

      {/* Create-only modal */}
      <Modal isOpen={moduleModalOpen} onClose={() => setModuleModalOpen(false)} title="New Module" onSave={handleCreateModule} wide>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Chapter"><input type="text" value={moduleForm.chapter ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, chapter: e.target.value }))} placeholder="e.g., 1" style={inputStyle} /></FormField>
          <FormField label="Status">
            <select value={moduleForm.status} onChange={e => setModuleForm(prev => ({ ...prev, status: e.target.value as Module['status'] }))} style={inputStyle}>
              <option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option>
            </select>
          </FormField>
        </div>
        <FormField label="Title"><input type="text" value={moduleForm.title} onChange={e => setModuleForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g., The Train Heist" style={inputStyle} /></FormField>
        <FormField label="Synopsis"><textarea value={moduleForm.synopsis ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, synopsis: e.target.value }))} placeholder="Overview of this chapter's events…" style={{ ...textareaStyle, minHeight: '80px' }} /></FormField>
        <FormField label="Encounters"><textarea value={moduleForm.encounters ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, encounters: e.target.value }))} placeholder="Key scenes, encounters…" style={{ ...textareaStyle, minHeight: '120px' }} /></FormField>
        <FormField label="Rewards"><textarea value={moduleForm.rewards ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, rewards: e.target.value }))} placeholder="Loot, level-ups…" style={{ ...textareaStyle, minHeight: '60px' }} /></FormField>
        <FormField label="DM Notes"><textarea value={moduleForm.dm_notes ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, dm_notes: e.target.value }))} placeholder="Hidden info, fallbacks…" style={{ ...textareaStyle, minHeight: '60px' }} /></FormField>
      </Modal>
    </div>
  );
}
