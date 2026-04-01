import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Module } from '../../lib/database.types';
import ModuleDetail from './ModuleDetail';

// --------------- Module form ---------------

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
  chapter: '',
  title: '',
  synopsis: '',
  encounters: '',
  rewards: '',
  dm_notes: '',
  status: 'planned',
});

// --------------- Styles ---------------

const statusStyles: Record<Module['status'], { bg: string; text: string; border: string }> = {
  planned:   { bg: '#1a1a3a', text: '#6090e0', border: '#3a3a7a' },
  active:    { bg: '#1a3a1a', text: '#4caf7d', border: '#2a7a2a' },
  completed: { bg: '#2a2a2a', text: '#7a7a7a', border: '#4a4a4a' },
};

// ================================================================
// MAIN COMPONENT
// ================================================================

export default function Modules() {
  const { modules, upsertModule, submodules, moduleSheets } = useCampaign();

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  // Module modal
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [moduleForm, setModuleForm] = useState<ModuleForm>(emptyModuleForm());

  const openAddModule = () => {
    setEditingModule(null);
    setModuleForm(emptyModuleForm());
    setModuleModalOpen(true);
  };

  const handleSaveModule = async () => {
    await upsertModule({
      ...(editingModule ? { id: editingModule.id } : {}),
      ...moduleForm,
      played_session: editingModule?.played_session ?? null,
    });
    setModuleModalOpen(false);
  };

  // If a module is selected, render its detail page
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

  // ----------------------------------------------------------------
  // LIST VIEW
  // ----------------------------------------------------------------

  return (
    <div style={{ maxWidth: '820px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Modules
        </h2>
        <button
          onClick={openAddModule}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add Module
        </button>
      </div>

      {modules.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No modules yet. Add your first campaign chapter!
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map(mod => {
            const ss = statusStyles[mod.status];
            const modSubmodules = submodules.filter(s => s.module_id === mod.id);
            const modSheets = moduleSheets.filter(s => s.module_id === mod.id);

            return (
              <div
                key={mod.id}
                className="rounded-lg border p-4 flex items-center gap-4"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                {/* Chapter number */}
                {mod.chapter && (
                  <div
                    className="text-3xl font-bold shrink-0 w-10 text-center"
                    style={{ color: '#3a3660', fontFamily: 'Georgia, serif' }}
                  >
                    {mod.chapter}
                  </div>
                )}

                {/* Title + synopsis */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                    {mod.chapter ? `${mod.chapter}: ` : ''}{mod.title || 'Untitled'}
                  </h3>
                  {mod.synopsis && (
                    <p className="text-sm mt-0.5" style={{ color: '#9990b0', lineHeight: '1.5' }}>
                      {mod.synopsis.substring(0, 120)}{mod.synopsis.length > 120 ? '…' : ''}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className="text-xs px-2 py-0.5 rounded border capitalize"
                      style={{ backgroundColor: ss.bg, color: ss.text, borderColor: ss.border }}
                    >
                      {mod.status}
                    </span>
                    {modSubmodules.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#2a2050', color: '#8070c0' }}>
                        {modSubmodules.length} submodule{modSubmodules.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {modSheets.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#2a1a2a', color: '#b070a0' }}>
                        {modSheets.length} sheet{modSheets.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Open button */}
                <button
                  onClick={() => setSelectedModuleId(mod.id)}
                  className="shrink-0 text-sm px-4 py-2 rounded font-semibold"
                  style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
                >
                  Open →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================
          MODULE MODAL
      ================================================================ */}
      <Modal
        isOpen={moduleModalOpen}
        onClose={() => setModuleModalOpen(false)}
        title={editingModule ? 'Edit Module' : 'New Module'}
        onSave={handleSaveModule}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Chapter">
            <input
              type="text"
              value={moduleForm.chapter ?? ''}
              onChange={e => setModuleForm(prev => ({ ...prev, chapter: e.target.value }))}
              placeholder="e.g., 1"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Status">
            <select
              value={moduleForm.status}
              onChange={e => setModuleForm(prev => ({ ...prev, status: e.target.value as Module['status'] }))}
              style={inputStyle}
            >
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </FormField>
        </div>
        <FormField label="Title">
          <input
            type="text"
            value={moduleForm.title}
            onChange={e => setModuleForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., The Train Heist"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Synopsis">
          <textarea
            value={moduleForm.synopsis ?? ''}
            onChange={e => setModuleForm(prev => ({ ...prev, synopsis: e.target.value }))}
            placeholder="Overview of this chapter's events, goals, and themes..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Encounters & Story Beats">
          <textarea
            value={moduleForm.encounters ?? ''}
            onChange={e => setModuleForm(prev => ({ ...prev, encounters: e.target.value }))}
            placeholder="Key scenes, encounters, revelations, branching paths..."
            style={{ ...textareaStyle, minHeight: '120px' }}
          />
        </FormField>
        <FormField label="Rewards">
          <textarea
            value={moduleForm.rewards ?? ''}
            onChange={e => setModuleForm(prev => ({ ...prev, rewards: e.target.value }))}
            placeholder="Loot, level-ups, plot rewards..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
        <FormField label="DM Notes">
          <textarea
            value={moduleForm.dm_notes ?? ''}
            onChange={e => setModuleForm(prev => ({ ...prev, dm_notes: e.target.value }))}
            placeholder="Hidden information, fallbacks, secret motives..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
