import { useState, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Module, Submodule, Scene, ModuleSheet, MonsterStatblock, Encounter } from '../../lib/database.types';

// --------------- Form types ---------------

type SubmoduleForm = {
  title: string;
  submodule_type: string;
  summary: string;
  content: string;
  dm_notes: string;
};

const emptySubmoduleForm = (): SubmoduleForm => ({
  title: '',
  submodule_type: 'location',
  summary: '',
  content: '',
  dm_notes: '',
});

type SceneForm = {
  title: string;
  scene_type: string;
  summary: string;
  content: string;
  dm_notes: string;
};

const emptySceneForm = (): SceneForm => ({
  title: '',
  scene_type: 'encounter',
  summary: '',
  content: '',
  dm_notes: '',
});

type SheetForm = {
  title: string;
  sheet_type: string;
  content: string;
  dm_notes: string;
};

const emptySheetForm = (): SheetForm => ({
  title: '',
  sheet_type: 'creature',
  content: '',
  dm_notes: '',
});

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

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  location:    { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  encounter:   { bg: '#3a1a1a', text: '#e07070', border: '#7a2a2a' },
  heist:       { bg: '#2a1a3a', text: '#c080e0', border: '#5a2a7a' },
  event:       { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  puzzle:      { bg: '#1a3a2a', text: '#70d090', border: '#2a6a4a' },
  social:      { bg: '#3a2a1a', text: '#e0a060', border: '#7a5a2a' },
  travel:      { bg: '#2a2a2a', text: '#a0a0a0', border: '#505050' },
  trap:        { bg: '#3a2a1a', text: '#e08040', border: '#7a4a2a' },
  exploration: { bg: '#1a3a2a', text: '#60c080', border: '#2a6a4a' },
  other:       { bg: '#1a1a1a', text: '#808080', border: '#404040' },
  creature:    { bg: '#3a1a1a', text: '#e07070', border: '#7a2a2a' },
  npc:         { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  pc:          { bg: '#1a3a1a', text: '#4caf7d', border: '#2a7a2a' },
  vehicle:     { bg: '#2a2a1a', text: '#c0b060', border: '#5a5a2a' },
};

const getTypeStyle = (t: string | null) =>
  typeColors[t ?? 'other'] ?? typeColors['other'];

const sectionLabel = {
  color: '#c9a84c',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '0.4rem',
};

// ================================================================
// PROPS
// ================================================================

interface ModuleDetailProps {
  module: Module;
  onBack: () => void;
  onModuleDeleted: () => void;
}

// ================================================================
// MAIN COMPONENT
// ================================================================

// Helper: parse linked_monster_ids JSON field
function parseLinkedIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export default function ModuleDetail({ module: mod, onBack, onModuleDeleted }: ModuleDetailProps) {
  const {
    upsertModule, deleteModule,
    submodules, loadSubmodules, upsertSubmodule, deleteSubmodule,
    scenes, loadScenes, upsertScene, deleteScene,
    moduleSheets, loadModuleSheets, upsertModuleSheet, deleteModuleSheet,
    monsterStatblocks,
    encounters,
  } = useCampaign();

  const [activeSection, setActiveSection] = useState<'submodules' | 'sheets' | 'overview'>('submodules');
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);

  // Module edit modal
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleForm, setModuleForm] = useState<ModuleForm>(emptyModuleForm());

  // Submodule modal
  const [submodalOpen, setSubmodalOpen] = useState(false);
  const [editingSubmodule, setEditingSubmodule] = useState<Submodule | null>(null);
  const [subForm, setSubForm] = useState<SubmoduleForm>(emptySubmoduleForm());
  const [subParentId, setSubParentId] = useState<string | null>(null);

  // Scene modal
  const [sceneModalOpen, setSceneModalOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [sceneForm, setSceneForm] = useState<SceneForm>(emptySceneForm());
  const [sceneParentSubId, setSceneParentSubId] = useState<string | null>(null);

  // Sheet modal
  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const [editingSheet, setEditingSheet] = useState<ModuleSheet | null>(null);
  const [sheetForm, setSheetForm] = useState<SheetForm>(emptySheetForm());
  const [sheetParentId, setSheetParentId] = useState<string | null>(null);

  // Detail views
  const [viewingSubmodule, setViewingSubmodule] = useState<Submodule | null>(null);
  const [viewingScene, setViewingScene] = useState<Scene | null>(null);
  const [viewingSheet, setViewingSheet] = useState<ModuleSheet | null>(null);

  // Creature picker
  const [creaturePickerTarget, setCreaturePickerTarget] = useState<
    { kind: 'submodule'; item: Submodule } | { kind: 'scene'; item: Scene } | null
  >(null);
  const [viewingLinkedCreature, setViewingLinkedCreature] = useState<MonsterStatblock | null>(null);

  // Encounter picker
  const [encounterPickerSubId, setEncounterPickerSubId] = useState<string | null>(null);
  const [viewingLinkedEncounter, setViewingLinkedEncounter] = useState<Encounter | null>(null);

  useEffect(() => {
    loadSubmodules(mod.id);
    loadModuleSheets(mod.id);
  }, [mod.id, loadSubmodules, loadModuleSheets]);

  useEffect(() => {
    if (expandedSubId) loadScenes(expandedSubId);
  }, [expandedSubId, loadScenes]);

  const modSubmodules = submodules.filter(s => s.module_id === mod.id);
  const modSheets = moduleSheets.filter(s => s.module_id === mod.id);
  const ss = statusStyles[mod.status];

  // ---- Module CRUD ----

  const openEditModule = () => {
    setModuleForm({
      chapter: mod.chapter,
      title: mod.title,
      synopsis: mod.synopsis,
      encounters: mod.encounters,
      rewards: mod.rewards,
      dm_notes: mod.dm_notes,
      status: mod.status,
    });
    setModuleModalOpen(true);
  };

  const handleSaveModule = async () => {
    await upsertModule({
      id: mod.id,
      ...moduleForm,
      played_session: mod.played_session ?? null,
    });
    setModuleModalOpen(false);
  };

  const handleDeleteModule = async () => {
    if (confirm('Delete this module and all its submodules and sheets?')) {
      await deleteModule(mod.id);
      onModuleDeleted();
    }
  };

  // ---- Submodule CRUD ----

  const openAddSubmodule = () => {
    setSubParentId(mod.id);
    setEditingSubmodule(null);
    setSubForm(emptySubmoduleForm());
    setSubmodalOpen(true);
  };

  const openEditSubmodule = (sub: Submodule) => {
    setSubParentId(sub.module_id);
    setEditingSubmodule(sub);
    setSubForm({
      title: sub.title,
      submodule_type: sub.submodule_type ?? 'location',
      summary: sub.summary ?? '',
      content: sub.content ?? '',
      dm_notes: sub.dm_notes ?? '',
    });
    setSubmodalOpen(true);
  };

  const handleSaveSubmodule = async () => {
    if (!subParentId) return;
    const existing = submodules.filter(s => s.module_id === subParentId);
    await upsertSubmodule({
      ...(editingSubmodule ? { id: editingSubmodule.id } : {}),
      module_id: subParentId,
      title: subForm.title,
      submodule_type: subForm.submodule_type || null,
      summary: subForm.summary || null,
      content: subForm.content || null,
      dm_notes: subForm.dm_notes || null,
      sort_order: editingSubmodule?.sort_order ?? existing.length,
    });
    setSubmodalOpen(false);
  };

  const handleDeleteSubmodule = async (sub: Submodule) => {
    if (confirm(`Delete "${sub.title}" and all its scenes?`)) {
      await deleteSubmodule(sub.id, sub.module_id);
      if (viewingSubmodule?.id === sub.id) setViewingSubmodule(null);
      if (expandedSubId === sub.id) setExpandedSubId(null);
    }
  };

  // ---- Scene CRUD ----

  const openAddScene = (submoduleId: string) => {
    setSceneParentSubId(submoduleId);
    setEditingScene(null);
    setSceneForm(emptySceneForm());
    setSceneModalOpen(true);
  };

  const openEditScene = (scene: Scene) => {
    setSceneParentSubId(scene.submodule_id);
    setEditingScene(scene);
    setSceneForm({
      title: scene.title,
      scene_type: scene.scene_type ?? 'encounter',
      summary: scene.summary ?? '',
      content: scene.content ?? '',
      dm_notes: scene.dm_notes ?? '',
    });
    setSceneModalOpen(true);
  };

  const handleSaveScene = async () => {
    if (!sceneParentSubId) return;
    const existing = scenes.filter(s => s.submodule_id === sceneParentSubId);
    await upsertScene({
      ...(editingScene ? { id: editingScene.id } : {}),
      submodule_id: sceneParentSubId,
      title: sceneForm.title,
      scene_type: sceneForm.scene_type || null,
      summary: sceneForm.summary || null,
      content: sceneForm.content || null,
      dm_notes: sceneForm.dm_notes || null,
      sort_order: editingScene?.sort_order ?? existing.length,
    });
    setSceneModalOpen(false);
  };

  const handleDeleteScene = async (scene: Scene) => {
    if (confirm(`Delete "${scene.title}"?`)) {
      await deleteScene(scene.id, scene.submodule_id);
      if (viewingScene?.id === scene.id) setViewingScene(null);
    }
  };

  // ---- Sheet CRUD ----

  const openAddSheet = () => {
    setSheetParentId(mod.id);
    setEditingSheet(null);
    setSheetForm(emptySheetForm());
    setSheetModalOpen(true);
  };

  const openEditSheet = (sheet: ModuleSheet) => {
    setSheetParentId(sheet.module_id);
    setEditingSheet(sheet);
    setSheetForm({
      title: sheet.title,
      sheet_type: sheet.sheet_type ?? 'creature',
      content: sheet.content ?? '',
      dm_notes: sheet.dm_notes ?? '',
    });
    setSheetModalOpen(true);
  };

  const handleSaveSheet = async () => {
    if (!sheetParentId) return;
    const existing = moduleSheets.filter(s => s.module_id === sheetParentId);
    await upsertModuleSheet({
      ...(editingSheet ? { id: editingSheet.id } : {}),
      module_id: sheetParentId,
      title: sheetForm.title,
      sheet_type: sheetForm.sheet_type || null,
      content: sheetForm.content || null,
      dm_notes: sheetForm.dm_notes || null,
      sort_order: editingSheet?.sort_order ?? existing.length,
    });
    setSheetModalOpen(false);
  };

  const handleDeleteSheet = async (sheet: ModuleSheet) => {
    if (confirm(`Delete "${sheet.title}"?`)) {
      await deleteModuleSheet(sheet.id, sheet.module_id);
      if (viewingSheet?.id === sheet.id) setViewingSheet(null);
    }
  };

  // ---- Creature linking ----

  const handleLinkCreature = async (creatureId: string) => {
    if (!creaturePickerTarget) return;
    if (creaturePickerTarget.kind === 'submodule') {
      const sub = creaturePickerTarget.item;
      const ids = parseLinkedIds(sub.linked_monster_ids);
      if (ids.includes(creatureId)) { setCreaturePickerTarget(null); return; }
      await upsertSubmodule({ ...sub, linked_monster_ids: JSON.stringify([...ids, creatureId]) });
    } else {
      const scene = creaturePickerTarget.item;
      const ids = parseLinkedIds(scene.linked_monster_ids);
      if (ids.includes(creatureId)) { setCreaturePickerTarget(null); return; }
      await upsertScene({ ...scene, linked_monster_ids: JSON.stringify([...ids, creatureId]) });
    }
    setCreaturePickerTarget(null);
  };

  const handleUnlinkCreature = async (
    target: { kind: 'submodule'; item: Submodule } | { kind: 'scene'; item: Scene },
    creatureId: string,
  ) => {
    if (target.kind === 'submodule') {
      const sub = target.item;
      const ids = parseLinkedIds(sub.linked_monster_ids).filter(id => id !== creatureId);
      await upsertSubmodule({ ...sub, linked_monster_ids: JSON.stringify(ids) });
    } else {
      const scene = target.item;
      const ids = parseLinkedIds(scene.linked_monster_ids).filter(id => id !== creatureId);
      await upsertScene({ ...scene, linked_monster_ids: JSON.stringify(ids) });
    }
  };

  // ---- Encounter linking ----

  const handleLinkEncounter = async (encounterId: string) => {
    if (!encounterPickerSubId) return;
    const sub = submodules.find(s => s.id === encounterPickerSubId);
    if (!sub) return;
    const ids = parseLinkedIds(sub.linked_encounter_ids);
    if (ids.includes(encounterId)) { setEncounterPickerSubId(null); return; }
    await upsertSubmodule({ ...sub, linked_encounter_ids: JSON.stringify([...ids, encounterId]) });
    setEncounterPickerSubId(null);
  };

  const handleUnlinkEncounter = async (sub: Submodule, encounterId: string) => {
    const ids = parseLinkedIds(sub.linked_encounter_ids).filter(id => id !== encounterId);
    await upsertSubmodule({ ...sub, linked_encounter_ids: JSON.stringify(ids) });
  };

  // ----------------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------------

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Back button + header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-sm px-3 py-1.5 rounded flex items-center gap-1"
          style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2e2b50')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#22203a')}
        >
          ← Modules
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2
              className="text-2xl font-bold"
              style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}
            >
              {mod.chapter ? `${mod.chapter}: ` : ''}{mod.title}
            </h2>
            <span
              className="text-xs px-2 py-1 rounded border capitalize"
              style={{ backgroundColor: ss.bg, color: ss.text, borderColor: ss.border }}
            >
              {mod.status}
            </span>
          </div>
          {mod.synopsis && (
            <p className="text-sm mt-0.5" style={{ color: '#9990b0' }}>
              {mod.synopsis}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={openEditModule}
            className="text-xs px-3 py-1.5 rounded"
            style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2e2b50')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#22203a')}
          >
            Edit
          </button>
          <button
            onClick={handleDeleteModule}
            className="text-xs px-3 py-1.5 rounded"
            style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2e2b50')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#22203a')}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Section tab bar */}
      <div className="flex border-b mb-5" style={{ borderColor: '#3a3660' }}>
        {(['submodules', 'sheets', 'overview'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveSection(t)}
            className="px-5 py-2.5 text-sm font-semibold capitalize transition-colors"
            style={{
              color: activeSection === t ? '#c9a84c' : '#6a6490',
              borderBottom: activeSection === t ? '2px solid #c9a84c' : '2px solid transparent',
              backgroundColor: 'transparent',
            }}
          >
            {t === 'submodules'
              ? `Submodules${modSubmodules.length ? ` (${modSubmodules.length})` : ''}`
              : t === 'sheets'
              ? `Stat Sheets${modSheets.length ? ` (${modSheets.length})` : ''}`
              : 'Overview'}
          </button>
        ))}
      </div>

      {/* ===== SUBMODULES SECTION ===== */}
      {activeSection === 'submodules' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span style={sectionLabel}>Submodules</span>
            <button
              onClick={openAddSubmodule}
              className="text-sm px-4 py-1.5 rounded font-semibold"
              style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
            >
              + Add Submodule
            </button>
          </div>

          {modSubmodules.length === 0 ? (
            <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>
              No submodules yet. Add a location or story beat.
            </p>
          ) : (
            <div className="space-y-3">
              {modSubmodules.map(sub => {
                const ts = getTypeStyle(sub.submodule_type);
                const isSubExpanded = expandedSubId === sub.id;
                const subScenes = scenes.filter(sc => sc.submodule_id === sub.id);

                return (
                  <div
                    key={sub.id}
                    className="rounded-lg border overflow-hidden"
                    style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
                  >
                    {/* Submodule header */}
                    <div className="flex items-start gap-3 p-4">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setExpandedSubId(isSubExpanded ? null : sub.id)}
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs" style={{ color: '#6a6490' }}>
                            {isSubExpanded ? '▼' : '▶'}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded border capitalize shrink-0"
                            style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                          >
                            {sub.submodule_type ?? 'other'}
                          </span>
                          <span
                            className="font-semibold text-sm"
                            style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}
                          >
                            {sub.title}
                          </span>
                          {subScenes.length > 0 && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: '#1a1a3a', color: '#6090e0' }}
                            >
                              {subScenes.length} scene{subScenes.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {sub.summary && !isSubExpanded && (
                          <p className="text-sm ml-5" style={{ color: '#9990b0', lineHeight: '1.5' }}>
                            {sub.summary.substring(0, 180)}{sub.summary.length > 180 ? '…' : ''}
                          </p>
                        )}
                        {sub.summary && isSubExpanded && (
                          <p className="text-sm ml-5 mb-2" style={{ color: '#9990b0', lineHeight: '1.5', fontStyle: 'italic' }}>
                            {sub.summary}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => setViewingSubmodule(sub)}
                          className="text-xs px-2.5 py-1 rounded"
                          style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => openEditSubmodule(sub)}
                          className="text-xs px-2.5 py-1 rounded"
                          style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSubmodule(sub)}
                          className="text-xs px-2.5 py-1 rounded"
                          style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Scenes + Linked Creatures (expanded) */}
                    {isSubExpanded && (
                      <div
                        className="border-t"
                        style={{ borderColor: '#2a2648', backgroundColor: '#0f0e1a' }}
                      >
                        {/* Linked Creatures */}
                        {(() => {
                          const linkedIds = parseLinkedIds(sub.linked_monster_ids);
                          const linked = linkedIds
                            .map(id => monsterStatblocks.find(m => m.id === id))
                            .filter((m): m is MonsterStatblock => !!m);
                          return (
                            <div className="px-4 pt-3 pb-1">
                              <div className="flex justify-between items-center mb-2">
                                <span style={{ ...sectionLabel, marginBottom: 0 }}>Linked Creatures</span>
                                <button
                                  onClick={() => setCreaturePickerTarget({ kind: 'submodule', item: sub })}
                                  className="text-xs px-2.5 py-1 rounded"
                                  style={{ backgroundColor: '#3a1a1a', color: '#e07070', border: '1px solid #7a2a2a' }}
                                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#5a2a2a')}
                                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#3a1a1a')}
                                >
                                  + Link Creature
                                </button>
                              </div>
                              {linked.length === 0 ? (
                                <p className="text-xs mb-2" style={{ color: '#6a6490', fontStyle: 'italic' }}>No creatures linked.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {linked.map(m => {
                                    const ts = getTypeStyle(m.creature_type);
                                    return (
                                      <div
                                        key={m.id}
                                        className="flex items-center gap-1.5 rounded border px-2 py-1"
                                        style={{ backgroundColor: ts.bg, borderColor: ts.border }}
                                      >
                                        <button
                                          onClick={() => setViewingLinkedCreature(m)}
                                          className="text-xs font-medium"
                                          style={{ color: ts.text }}
                                        >
                                          {m.name}{m.challenge_rating ? ` (CR ${m.challenge_rating})` : ''}
                                        </button>
                                        <button
                                          onClick={() => handleUnlinkCreature({ kind: 'submodule', item: sub }, m.id)}
                                          className="text-xs"
                                          style={{ color: '#6a6490' }}
                                          title="Unlink"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Linked Encounters */}
                        {(() => {
                          const linkedIds = parseLinkedIds(sub.linked_encounter_ids);
                          const linked = linkedIds
                            .map(id => encounters.find(e => e.id === id))
                            .filter((e): e is Encounter => !!e);
                          return (
                            <div className="px-4 pt-1 pb-1">
                              <div className="flex justify-between items-center mb-2">
                                <span style={{ ...sectionLabel, marginBottom: 0 }}>Linked Encounters</span>
                                <button
                                  onClick={() => setEncounterPickerSubId(sub.id)}
                                  className="text-xs px-2.5 py-1 rounded"
                                  style={{ backgroundColor: '#1a2a3a', color: '#70a0e0', border: '1px solid #2a4a7a' }}
                                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a3a5a')}
                                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1a2a3a')}
                                >
                                  + Link Encounter
                                </button>
                              </div>
                              {linked.length === 0 ? (
                                <p className="text-xs mb-2" style={{ color: '#6a6490', fontStyle: 'italic' }}>No encounters linked.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {linked.map(enc => {
                                    const diffColors: Record<string, { bg: string; text: string; border: string }> = {
                                      easy:   { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
                                      medium: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
                                      hard:   { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
                                      deadly: { bg: '#3a1010', text: '#e04040', border: '#7a2020' },
                                    };
                                    const dc = diffColors[enc.difficulty ?? ''] ?? { bg: '#1a1828', text: '#9990b0', border: '#3a3660' };
                                    return (
                                      <div
                                        key={enc.id}
                                        className="flex items-center gap-1.5 rounded border px-2 py-1"
                                        style={{ backgroundColor: dc.bg, borderColor: dc.border }}
                                      >
                                        <button
                                          onClick={() => setViewingLinkedEncounter(enc)}
                                          className="text-xs font-medium"
                                          style={{ color: dc.text }}
                                        >
                                          {enc.name}{enc.difficulty ? ` (${enc.difficulty})` : ''}
                                        </button>
                                        <button
                                          onClick={() => handleUnlinkEncounter(sub, enc.id)}
                                          className="text-xs"
                                          style={{ color: '#6a6490' }}
                                          title="Unlink"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div className="flex justify-between items-center px-4 py-3">
                          <span style={{ ...sectionLabel, marginBottom: 0 }}>Scenes</span>
                          <button
                            onClick={() => openAddScene(sub.id)}
                            className="text-xs px-3 py-1 rounded font-semibold"
                            style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
                          >
                            + Add Scene
                          </button>
                        </div>
                        {subScenes.length === 0 ? (
                          <p className="text-xs px-4 pb-4" style={{ color: '#6a6490', fontStyle: 'italic' }}>
                            No scenes yet.
                          </p>
                        ) : (
                          <div className="space-y-2 px-4 pb-4">
                            {subScenes.map(scene => {
                              const scs = getTypeStyle(scene.scene_type);
                              return (
                                <div
                                  key={scene.id}
                                  className="rounded border p-3 flex items-start justify-between gap-3"
                                  style={{ backgroundColor: '#141222', borderColor: '#2a2648' }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span
                                        className="text-xs px-1.5 py-0.5 rounded border capitalize shrink-0"
                                        style={{ backgroundColor: scs.bg, color: scs.text, borderColor: scs.border }}
                                      >
                                        {scene.scene_type ?? 'other'}
                                      </span>
                                      <span
                                        className="text-sm font-medium"
                                        style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}
                                      >
                                        {scene.title}
                                      </span>
                                    </div>
                                    {scene.summary && (
                                      <p className="text-xs mt-0.5" style={{ color: '#9990b0', lineHeight: '1.5' }}>
                                        {scene.summary.substring(0, 140)}{scene.summary.length > 140 ? '…' : ''}
                                      </p>
                                    )}
                                    {/* Linked creatures on scene */}
                                    {(() => {
                                      const linkedIds = parseLinkedIds(scene.linked_monster_ids);
                                      const linked = linkedIds
                                        .map(id => monsterStatblocks.find(m => m.id === id))
                                        .filter((m): m is MonsterStatblock => !!m);
                                      return linked.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                          {linked.map(m => {
                                            const ts = getTypeStyle(m.creature_type);
                                            return (
                                              <div
                                                key={m.id}
                                                className="flex items-center gap-1 rounded border px-1.5 py-0.5"
                                                style={{ backgroundColor: ts.bg, borderColor: ts.border }}
                                              >
                                                <button
                                                  onClick={() => setViewingLinkedCreature(m)}
                                                  className="text-xs"
                                                  style={{ color: ts.text }}
                                                >
                                                  {m.name}{m.challenge_rating ? ` CR${m.challenge_rating}` : ''}
                                                </button>
                                                <button
                                                  onClick={() => handleUnlinkCreature({ kind: 'scene', item: scene }, m.id)}
                                                  className="text-xs"
                                                  style={{ color: '#6a6490' }}
                                                  title="Unlink"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex gap-1.5 shrink-0">
                                    <button
                                      onClick={() => setCreaturePickerTarget({ kind: 'scene', item: scene })}
                                      className="text-xs px-2 py-1 rounded"
                                      style={{ backgroundColor: '#3a1a1a', color: '#e07070', border: '1px solid #7a2a2a' }}
                                      title="Link creature"
                                    >
                                      + Creature
                                    </button>
                                    <button
                                      onClick={() => setViewingScene(scene)}
                                      className="text-xs px-2.5 py-1 rounded"
                                      style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
                                    >
                                      View
                                    </button>
                                    <button
                                      onClick={() => openEditScene(scene)}
                                      className="text-xs px-2.5 py-1 rounded"
                                      style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteScene(scene)}
                                      className="text-xs px-2.5 py-1 rounded"
                                      style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== SHEETS SECTION ===== */}
      {activeSection === 'sheets' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span style={sectionLabel}>Stat Sheets</span>
            <button
              onClick={openAddSheet}
              className="text-sm px-4 py-1.5 rounded font-semibold"
              style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
            >
              + Add Sheet
            </button>
          </div>

          {modSheets.length === 0 ? (
            <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>
              No sheets yet. Add a creature stat block or character sheet.
            </p>
          ) : (
            <div className="space-y-2">
              {modSheets.map(sheet => {
                const ts = getTypeStyle(sheet.sheet_type);
                return (
                  <div
                    key={sheet.id}
                    className="rounded-lg border p-4"
                    style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-xs px-2 py-0.5 rounded border capitalize shrink-0"
                          style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                        >
                          {sheet.sheet_type ?? 'other'}
                        </span>
                        <span
                          className="font-semibold text-sm"
                          style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}
                        >
                          {sheet.title}
                        </span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => setViewingSheet(sheet)}
                          className="text-xs px-2.5 py-1 rounded"
                          style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => openEditSheet(sheet)}
                          className="text-xs px-2.5 py-1 rounded"
                          style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSheet(sheet)}
                          className="text-xs px-2.5 py-1 rounded"
                          style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== OVERVIEW SECTION ===== */}
      {activeSection === 'overview' && (
        <div className="space-y-5">
          {mod.synopsis && (
            <div>
              <div style={sectionLabel}>Synopsis</div>
              <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.7' }}>{mod.synopsis}</p>
            </div>
          )}
          {mod.encounters && (
            <div>
              <div style={sectionLabel}>Encounters & Story Beats</div>
              <pre
                className="text-sm whitespace-pre-wrap"
                style={{ color: '#e8d5b0', lineHeight: '1.7', fontFamily: 'Georgia, serif' }}
              >
                {mod.encounters}
              </pre>
            </div>
          )}
          {mod.rewards && (
            <div>
              <div style={sectionLabel}>Rewards</div>
              <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.7' }}>{mod.rewards}</p>
            </div>
          )}
          {mod.dm_notes && (
            <div>
              <div style={sectionLabel}>DM Notes</div>
              <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.7', fontStyle: 'italic' }}>{mod.dm_notes}</p>
            </div>
          )}
          {!mod.synopsis && !mod.encounters && !mod.rewards && !mod.dm_notes && (
            <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>
              No details recorded for this module.
            </p>
          )}
        </div>
      )}

      {/* ================================================================
          MODULE EDIT MODAL
      ================================================================ */}
      <Modal
        isOpen={moduleModalOpen}
        onClose={() => setModuleModalOpen(false)}
        title="Edit Module"
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

      {/* ================================================================
          SUBMODULE MODAL
      ================================================================ */}
      <Modal
        isOpen={submodalOpen}
        onClose={() => setSubmodalOpen(false)}
        title={editingSubmodule ? 'Edit Submodule' : 'New Submodule'}
        onSave={handleSaveSubmodule}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type">
            <select
              value={subForm.submodule_type}
              onChange={e => setSubForm(prev => ({ ...prev, submodule_type: e.target.value }))}
              style={inputStyle}
            >
              <option value="location">Location</option>
              <option value="heist">Heist</option>
              <option value="event">Event</option>
              <option value="social">Social</option>
              <option value="travel">Travel</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <FormField label="Title">
            <input
              type="text"
              value={subForm.title}
              onChange={e => setSubForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Duskward, The Vault"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Summary">
          <textarea
            value={subForm.summary}
            onChange={e => setSubForm(prev => ({ ...prev, summary: e.target.value }))}
            placeholder="Short description shown in the list view..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
        <FormField label="Full Write-Up">
          <textarea
            value={subForm.content}
            onChange={e => setSubForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder="Full description of this location or story beat — history, atmosphere, key details, DM guidance..."
            style={{ ...textareaStyle, minHeight: '320px', fontFamily: 'Georgia, serif', lineHeight: '1.7' }}
          />
        </FormField>
        <FormField label="DM Notes">
          <textarea
            value={subForm.dm_notes}
            onChange={e => setSubForm(prev => ({ ...prev, dm_notes: e.target.value }))}
            placeholder="Hidden info, contingencies, secrets..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
      </Modal>

      {/* ================================================================
          SCENE MODAL
      ================================================================ */}
      <Modal
        isOpen={sceneModalOpen}
        onClose={() => setSceneModalOpen(false)}
        title={editingScene ? 'Edit Scene' : 'New Scene'}
        onSave={handleSaveScene}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type">
            <select
              value={sceneForm.scene_type}
              onChange={e => setSceneForm(prev => ({ ...prev, scene_type: e.target.value }))}
              style={inputStyle}
            >
              <option value="encounter">Encounter</option>
              <option value="puzzle">Puzzle</option>
              <option value="social">Social</option>
              <option value="trap">Trap</option>
              <option value="exploration">Exploration</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <FormField label="Title">
            <input
              type="text"
              value={sceneForm.title}
              onChange={e => setSceneForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Ambush in the Market"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Summary">
          <textarea
            value={sceneForm.summary}
            onChange={e => setSceneForm(prev => ({ ...prev, summary: e.target.value }))}
            placeholder="Short description shown in the list view..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
        <FormField label="Full Write-Up">
          <textarea
            value={sceneForm.content}
            onChange={e => setSceneForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder="Full scene details — read-aloud text, tactics, trigger conditions, outcomes, branching paths..."
            style={{ ...textareaStyle, minHeight: '320px', fontFamily: 'Georgia, serif', lineHeight: '1.7' }}
          />
        </FormField>
        <FormField label="DM Notes">
          <textarea
            value={sceneForm.dm_notes}
            onChange={e => setSceneForm(prev => ({ ...prev, dm_notes: e.target.value }))}
            placeholder="Hidden info, contingencies, secrets..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
      </Modal>

      {/* ================================================================
          SHEET MODAL
      ================================================================ */}
      <Modal
        isOpen={sheetModalOpen}
        onClose={() => setSheetModalOpen(false)}
        title={editingSheet ? 'Edit Sheet' : 'New Stat Sheet'}
        onSave={handleSaveSheet}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type">
            <select
              value={sheetForm.sheet_type}
              onChange={e => setSheetForm(prev => ({ ...prev, sheet_type: e.target.value }))}
              style={inputStyle}
            >
              <option value="creature">Creature</option>
              <option value="npc">NPC</option>
              <option value="pc">Player Character</option>
              <option value="vehicle">Vehicle</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <FormField label="Name">
            <input
              type="text"
              value={sheetForm.title}
              onChange={e => setSheetForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Cave Troll, Mira the Fence"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Stat Block / Sheet Content">
          <textarea
            value={sheetForm.content}
            onChange={e => setSheetForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder={`Paste or write the full stat block or character sheet here.\n\nExamples:\n— Creature: AC, HP, Speed, ability scores, saves, skills, actions, legendary actions\n— NPC: appearance, personality, motivations, secrets, stats if needed\n— PC: class, race, ability scores, HP, features, equipment, backstory notes`}
            style={{ ...textareaStyle, minHeight: '360px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.6' }}
          />
        </FormField>
        <FormField label="DM Notes">
          <textarea
            value={sheetForm.dm_notes}
            onChange={e => setSheetForm(prev => ({ ...prev, dm_notes: e.target.value }))}
            placeholder="Tactics, role in the encounter, hidden motivations..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
      </Modal>

      {/* ================================================================
          SUBMODULE DETAIL VIEW
      ================================================================ */}
      {viewingSubmodule && (
        <Modal
          isOpen={!!viewingSubmodule}
          onClose={() => setViewingSubmodule(null)}
          title={viewingSubmodule.title}
          wide
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(() => {
                const ts = getTypeStyle(viewingSubmodule.submodule_type);
                return (
                  <span
                    className="text-xs px-2 py-0.5 rounded border capitalize"
                    style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                  >
                    {viewingSubmodule.submodule_type ?? 'other'}
                  </span>
                );
              })()}
            </div>
            {viewingSubmodule.summary && (
              <div>
                <div style={sectionLabel}>Summary</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingSubmodule.summary}
                </p>
              </div>
            )}
            {viewingSubmodule.content && (
              <div>
                <div style={sectionLabel}>Full Write-Up</div>
                <pre
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: '#e8d5b0', lineHeight: '1.8', fontFamily: 'Georgia, serif' }}
                >
                  {viewingSubmodule.content}
                </pre>
              </div>
            )}
            {viewingSubmodule.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingSubmodule.dm_notes}
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setViewingSubmodule(null); openEditSubmodule(viewingSubmodule); }}
                className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
              >
                Edit
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================================================================
          SCENE DETAIL VIEW
      ================================================================ */}
      {viewingScene && (
        <Modal
          isOpen={!!viewingScene}
          onClose={() => setViewingScene(null)}
          title={viewingScene.title}
          wide
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(() => {
                const ts = getTypeStyle(viewingScene.scene_type);
                return (
                  <span
                    className="text-xs px-2 py-0.5 rounded border capitalize"
                    style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                  >
                    {viewingScene.scene_type ?? 'other'}
                  </span>
                );
              })()}
            </div>
            {viewingScene.summary && (
              <div>
                <div style={sectionLabel}>Summary</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingScene.summary}
                </p>
              </div>
            )}
            {viewingScene.content && (
              <div>
                <div style={sectionLabel}>Full Write-Up</div>
                <pre
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: '#e8d5b0', lineHeight: '1.8', fontFamily: 'Georgia, serif' }}
                >
                  {viewingScene.content}
                </pre>
              </div>
            )}
            {viewingScene.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingScene.dm_notes}
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setViewingScene(null); openEditScene(viewingScene); }}
                className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
              >
                Edit
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================================================================
          CREATURE PICKER MODAL
      ================================================================ */}
      {creaturePickerTarget && (
        <Modal
          isOpen={!!creaturePickerTarget}
          onClose={() => setCreaturePickerTarget(null)}
          title="Link Creature Stat Sheet"
          wide
        >
          <div className="space-y-3">
            {monsterStatblocks.length === 0 ? (
              <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>
                No creature stat sheets yet. Add some from the Creature Sheets tab first.
              </p>
            ) : (
              <>
                <p className="text-xs" style={{ color: '#9990b0' }}>
                  Select a creature to link to this {creaturePickerTarget.kind}.
                  Linked creatures are shown inline when viewing it.
                </p>
                {(() => {
                  const existingIds = parseLinkedIds(creaturePickerTarget.item.linked_monster_ids);
                  return monsterStatblocks.map(m => {
                    const ts = getTypeStyle(m.creature_type);
                    const alreadyLinked = existingIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className="rounded border p-3 flex items-center justify-between gap-3"
                        style={{ backgroundColor: '#1a1828', borderColor: alreadyLinked ? ts.border : '#3a3660' }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded border capitalize shrink-0"
                            style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                          >
                            {m.creature_type ?? 'other'}
                          </span>
                          <span className="text-sm font-medium" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                            {m.name}
                          </span>
                          {m.challenge_rating && (
                            <span className="text-xs" style={{ color: '#9990b0' }}>CR {m.challenge_rating}</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleLinkCreature(m.id)}
                          disabled={alreadyLinked}
                          className="text-xs px-3 py-1 rounded shrink-0 disabled:opacity-50"
                          style={{
                            backgroundColor: alreadyLinked ? '#1a1828' : '#a07830',
                            color: alreadyLinked ? '#6a6490' : '#e8d5b0',
                            border: alreadyLinked ? '1px solid #3a3660' : 'none',
                          }}
                        >
                          {alreadyLinked ? 'Already linked' : 'Link'}
                        </button>
                      </div>
                    );
                  });
                })()}
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ================================================================
          LINKED CREATURE VIEW MODAL
      ================================================================ */}
      {viewingLinkedCreature && (
        <Modal
          isOpen={!!viewingLinkedCreature}
          onClose={() => setViewingLinkedCreature(null)}
          title={viewingLinkedCreature.name}
          wide
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const ts = getTypeStyle(viewingLinkedCreature.creature_type);
                return (
                  <span
                    className="text-xs px-2 py-0.5 rounded border capitalize"
                    style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                  >
                    {viewingLinkedCreature.creature_type ?? 'other'}
                  </span>
                );
              })()}
              {viewingLinkedCreature.challenge_rating && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#c08060', border: '1px solid #5a3a2a' }}>
                  CR {viewingLinkedCreature.challenge_rating}
                </span>
              )}
              {viewingLinkedCreature.tags && (
                <span className="text-xs" style={{ color: '#6a6490' }}>{viewingLinkedCreature.tags}</span>
              )}
            </div>
            {viewingLinkedCreature.content && (
              <div>
                <div style={sectionLabel}>Stat Block</div>
                <pre
                  className="text-sm whitespace-pre-wrap rounded p-3"
                  style={{
                    color: '#e8d5b0',
                    lineHeight: '1.7',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    backgroundColor: '#0f0e17',
                    border: '1px solid #3a3660',
                  }}
                >
                  {viewingLinkedCreature.content}
                </pre>
              </div>
            )}
            {viewingLinkedCreature.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingLinkedCreature.dm_notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ================================================================
          SHEET DETAIL VIEW
      ================================================================ */}
      {viewingSheet && (
        <Modal
          isOpen={!!viewingSheet}
          onClose={() => setViewingSheet(null)}
          title={viewingSheet.title}
          wide
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(() => {
                const ts = getTypeStyle(viewingSheet.sheet_type);
                return (
                  <span
                    className="text-xs px-2 py-0.5 rounded border capitalize"
                    style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                  >
                    {viewingSheet.sheet_type ?? 'other'}
                  </span>
                );
              })()}
            </div>
            {viewingSheet.content && (
              <div>
                <div style={sectionLabel}>Stat Block / Sheet</div>
                <pre
                  className="text-sm whitespace-pre-wrap rounded p-3"
                  style={{
                    color: '#e8d5b0',
                    lineHeight: '1.7',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    backgroundColor: '#0f0e17',
                    border: '1px solid #3a3660',
                  }}
                >
                  {viewingSheet.content}
                </pre>
              </div>
            )}
            {viewingSheet.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingSheet.dm_notes}
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setViewingSheet(null); openEditSheet(viewingSheet); }}
                className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
              >
                Edit
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================================================================
          ENCOUNTER PICKER MODAL
      ================================================================ */}
      {encounterPickerSubId && (
        <Modal
          isOpen={!!encounterPickerSubId}
          onClose={() => setEncounterPickerSubId(null)}
          title="Link Encounter"
        >
          <div className="space-y-3">
            <p className="text-xs" style={{ color: '#9990b0' }}>
              Select an encounter to link to this submodule.
              Linked encounters are shown inline when viewing it.
            </p>
            {encounters.length === 0 ? (
              <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>
                No encounters found. Create some in the Encounter Builder tab first.
              </p>
            ) : (
              (() => {
                const sub = submodules.find(s => s.id === encounterPickerSubId);
                const existingIds = parseLinkedIds(sub?.linked_encounter_ids);
                return encounters.map(enc => {
                  const alreadyLinked = existingIds.includes(enc.id);
                  const diffColors: Record<string, { bg: string; text: string; border: string }> = {
                    easy:   { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
                    medium: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
                    hard:   { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
                    deadly: { bg: '#3a1010', text: '#e04040', border: '#7a2020' },
                  };
                  const dc = diffColors[enc.difficulty ?? ''] ?? { bg: '#1a1828', text: '#9990b0', border: '#3a3660' };
                  return (
                    <button
                      key={enc.id}
                      onClick={() => !alreadyLinked && handleLinkEncounter(enc.id)}
                      disabled={alreadyLinked}
                      className="w-full text-left rounded border p-3 flex items-center justify-between gap-3"
                      style={{
                        backgroundColor: alreadyLinked ? '#1a1828' : dc.bg,
                        borderColor: alreadyLinked ? '#3a3660' : dc.border,
                        opacity: alreadyLinked ? 0.5 : 1,
                        cursor: alreadyLinked ? 'default' : 'pointer',
                      }}
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium block" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                          {enc.name}
                        </span>
                        {(enc.difficulty || enc.environment) && (
                          <span className="text-xs" style={{ color: dc.text }}>
                            {[enc.difficulty, enc.environment].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      {alreadyLinked && (
                        <span className="text-xs shrink-0" style={{ color: '#6a6490' }}>linked</span>
                      )}
                    </button>
                  );
                });
              })()
            )}
          </div>
        </Modal>
      )}

      {/* ================================================================
          LINKED ENCOUNTER VIEW MODAL
      ================================================================ */}
      {viewingLinkedEncounter && (
        <Modal
          isOpen={!!viewingLinkedEncounter}
          onClose={() => setViewingLinkedEncounter(null)}
          title={viewingLinkedEncounter.name}
          wide
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {viewingLinkedEncounter.difficulty && (
                <span className="text-xs px-2 py-0.5 rounded border capitalize" style={{
                  backgroundColor: { easy: '#1a2a1a', medium: '#2a2a1a', hard: '#3a2010', deadly: '#3a1010' }[viewingLinkedEncounter.difficulty] ?? '#1a1828',
                  color: { easy: '#6ab87a', medium: '#d0c060', hard: '#e09050', deadly: '#e04040' }[viewingLinkedEncounter.difficulty] ?? '#9990b0',
                  borderColor: { easy: '#2a5a2a', medium: '#6a6020', hard: '#7a4a20', deadly: '#7a2020' }[viewingLinkedEncounter.difficulty] ?? '#3a3660',
                }}>
                  {viewingLinkedEncounter.difficulty}
                </span>
              )}
              {viewingLinkedEncounter.environment && (
                <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}>
                  {viewingLinkedEncounter.environment}
                </span>
              )}
              {(viewingLinkedEncounter.party_size || viewingLinkedEncounter.party_level) && (
                <span className="text-xs" style={{ color: '#6a6490' }}>
                  {[
                    viewingLinkedEncounter.party_size ? `${viewingLinkedEncounter.party_size} players` : null,
                    viewingLinkedEncounter.party_level ? `level ${viewingLinkedEncounter.party_level}` : null,
                  ].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
            {viewingLinkedEncounter.description && (
              <div>
                <div style={sectionLabel}>Description</div>
                <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.7' }}>
                  {viewingLinkedEncounter.description}
                </p>
              </div>
            )}
            {viewingLinkedEncounter.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingLinkedEncounter.dm_notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
