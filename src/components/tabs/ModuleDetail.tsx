import { useState, useEffect, useRef } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { Button } from '../ui/Button';
import { Breadcrumb } from '../ui/Breadcrumb';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { MarkdownContent } from '../ui/MarkdownContent';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import type { Module, Submodule, Scene, MonsterStatblock, Encounter, ModuleDependency, SubmoduleDependency } from '../../lib/database.types';
import { wouldCreateModuleCycle, wouldCreateSubmoduleCycle } from '../../lib/moduleUtils';

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
  chapter: '',
  title: '',
  synopsis: '',
  encounters: '',
  rewards: '',
  dm_notes: '',
  status: 'planned',
  faction_id: null,
  node_role: null,
});

const FACTION_TYPE_COLORS: Record<string, string> = {
  guild: 'var(--gold)', government: '#70a0e0', religious: '#d0c060',
  criminal: '#e05c5c', military: '#60b0a0', arcane: '#b080e0',
  merchant: '#e09050', other: 'var(--ink-2)',
};

// --------------- Styles ---------------

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
    loadModuleSheets,
    monsterStatblocks,
    encounters,
    modules, factions,
    selectedCampaignId,
    moduleDeps, upsertModuleDep, deleteModuleDep,
    submoduleDeps, loadSubmoduleDeps, upsertSubmoduleDep, deleteSubmoduleDep,
  } = useCampaign();
  const confirm = useConfirm();

  const [activeSection, setActiveSection] = useState<'submodules' | 'overview' | 'dependencies'>('submodules');
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

  // Detail views
  const [viewingSubmodule, setViewingSubmodule] = useState<Submodule | null>(null);
  const [viewingScene, setViewingScene] = useState<Scene | null>(null);

  // Creature picker
  const [creaturePickerTarget, setCreaturePickerTarget] = useState<
    { kind: 'submodule'; item: Submodule } | { kind: 'scene'; item: Scene } | null
  >(null);
  const [viewingLinkedCreature, setViewingLinkedCreature] = useState<MonsterStatblock | null>(null);

  // Encounter picker
  const [encounterPickerSubId, setEncounterPickerSubId] = useState<string | null>(null);
  const [viewingLinkedEncounter, setViewingLinkedEncounter] = useState<Encounter | null>(null);

  // Module dependency modal
  const [modDepModalOpen, setModDepModalOpen] = useState(false);
  const [modDepForm, setModDepForm] = useState<{
    prerequisite_id: string;
    dependency_type: 'required' | 'optional';
    group_id: string; // '' = new group
    label: string;
  }>({ prerequisite_id: '', dependency_type: 'required', group_id: '', label: '' });
  const [modDepError, setModDepError] = useState<string | null>(null);

  // Submodule dependency modal
  const [subDepModalSubId, setSubDepModalSubId] = useState<string | null>(null);
  const [subDepForm, setSubDepForm] = useState<{
    prerequisite_id: string;
    dependency_type: 'required' | 'optional';
    group_id: string;
    label: string;
  }>({ prerequisite_id: '', dependency_type: 'required', group_id: '', label: '' });
  const [subDepError, setSubDepError] = useState<string | null>(null);

  // Textarea refs for creature link insertion
  const modSynopsisRef = useRef<HTMLTextAreaElement>(null);
  const modEncountersRef = useRef<HTMLTextAreaElement>(null);
  const modRewardsRef = useRef<HTMLTextAreaElement>(null);
  const modDmNotesRef = useRef<HTMLTextAreaElement>(null);
  const subSummaryRef = useRef<HTMLTextAreaElement>(null);
  const subContentRef = useRef<HTMLTextAreaElement>(null);
  const subDmNotesRef = useRef<HTMLTextAreaElement>(null);
  const sceneSummaryRef = useRef<HTMLTextAreaElement>(null);
  const sceneContentRef = useRef<HTMLTextAreaElement>(null);
  const sceneDmNotesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSubmodules(mod.id);
    loadModuleSheets(mod.id);
    loadSubmoduleDeps(mod.id);
  }, [mod.id, loadSubmodules, loadModuleSheets, loadSubmoduleDeps]);

  useEffect(() => {
    if (expandedSubId) loadScenes(expandedSubId);
  }, [expandedSubId, loadScenes]);

  const modSubmodules = submodules.filter(s => s.module_id === mod.id);
  const expandedSub = expandedSubId ? modSubmodules.find(s => s.id === expandedSubId) : null;

  const breadcrumbSegments = [
    { label: 'Modules', onClick: onBack },
    { label: mod.chapter ? `${mod.chapter}: ${mod.title}` : mod.title },
    ...(expandedSub ? [{ label: expandedSub.title }] : []),
  ];

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
      faction_id: mod.faction_id,
      node_role: mod.node_role,
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
    if (await confirm('Delete this module and all its submodules and sheets?')) {
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
    if (await confirm(`Delete "${sub.title}" and all its scenes?`)) {
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
    if (await confirm(`Delete "${scene.title}"?`)) {
      await deleteScene(scene.id, scene.submodule_id);
      if (viewingScene?.id === scene.id) setViewingScene(null);
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

  // ---- Module dependency handlers ----

  const prereqs = moduleDeps.filter(d => d.dependent_id === mod.id);
  const dependents = moduleDeps.filter(d => d.prerequisite_id === mod.id);

  const openAddModDep = () => {
    setModDepForm({ prerequisite_id: '', dependency_type: 'required', group_id: '', label: '' });
    setModDepError(null);
    setModDepModalOpen(true);
  };

  const handleSaveModDep = async () => {
    if (!modDepForm.prerequisite_id || !selectedCampaignId) return;
    if (wouldCreateModuleCycle(moduleDeps, mod.id, modDepForm.prerequisite_id)) {
      setModDepError('This would create a circular dependency.');
      return;
    }
    const group_id = modDepForm.dependency_type === 'optional'
      ? (modDepForm.group_id || crypto.randomUUID())
      : null;
    await upsertModuleDep({
      campaign_id: selectedCampaignId,
      dependent_id: mod.id,
      prerequisite_id: modDepForm.prerequisite_id,
      dependency_type: modDepForm.dependency_type,
      group_id,
      label: modDepForm.label || null,
    });
    setModDepModalOpen(false);
  };

  // OR groups: unique group_ids among optional prereqs for this module
  const optionalPrereqs = prereqs.filter(d => d.dependency_type === 'optional');
  const orGroups = Array.from(new Set(optionalPrereqs.map(d => d.group_id).filter(Boolean) as string[]));

  // Modules available to add as prerequisites (exclude self and already-added)
  const existingPrereqIds = new Set(prereqs.map(d => d.prerequisite_id));
  const availableModules = modules.filter(m => m.id !== mod.id && !existingPrereqIds.has(m.id));

  // ---- Submodule dependency handlers ----

  const openAddSubDep = (subId: string) => {
    setSubDepModalSubId(subId);
    setSubDepForm({ prerequisite_id: '', dependency_type: 'required', group_id: '', label: '' });
    setSubDepError(null);
  };

  const handleSaveSubDep = async () => {
    if (!subDepModalSubId || !subDepForm.prerequisite_id) return;
    if (wouldCreateSubmoduleCycle(submoduleDeps, subDepModalSubId, subDepForm.prerequisite_id)) {
      setSubDepError('This would create a circular dependency.');
      return;
    }
    const group_id = subDepForm.dependency_type === 'optional'
      ? (subDepForm.group_id || crypto.randomUUID())
      : null;
    await upsertSubmoduleDep({
      dependent_id: subDepModalSubId,
      prerequisite_id: subDepForm.prerequisite_id,
      dependency_type: subDepForm.dependency_type,
      group_id,
      label: subDepForm.label || null,
    });
    setSubDepModalSubId(null);
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
    <div className="cm-detail">
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Breadcrumb segments={breadcrumbSegments} />
      </div>

      {/* Detail header */}
      <div className="cm-detail-head">
        <div className="cm-detail-eyebrow">
          {mod.chapter ? `Chapter ${mod.chapter}` : 'Module'} · {mod.status}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="cm-detail-title">
              {mod.title || 'Untitled'}
            </h2>
            {mod.synopsis && (
              <p className="cm-detail-sub">
                {mod.synopsis.length > 200 ? mod.synopsis.slice(0, 200) + '…' : mod.synopsis}
              </p>
            )}
            {/* badges row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span
                className={`cm-tag cm-tag-${mod.status === 'active' ? 'active' : mod.status === 'completed' ? 'muted' : 'planned'}`}
                style={{ textTransform: 'capitalize' }}
              >
                {mod.status}
              </span>
              {(() => {
                const faction = mod.faction_id ? factions.find(f => f.id === mod.faction_id) : null;
                if (!faction) return null;
                const fColor = FACTION_TYPE_COLORS[faction.faction_type ?? 'other'] ?? 'var(--ink-2)';
                return (
                  <span className="cm-chip" style={{ borderColor: fColor + '55' }}>
                    <span className="cm-chip-glyph" style={{ color: fColor }}>◆</span>
                    {faction.name}
                  </span>
                );
              })()}
              {mod.node_role && (
                <span className="cm-tag" style={{
                  color: mod.node_role === 'start' ? 'var(--gold)' : 'var(--accent)',
                  borderColor: mod.node_role === 'start' ? 'rgba(201,168,76,.35)' : 'rgba(201,122,85,.35)',
                  background: mod.node_role === 'start' ? 'rgba(201,168,76,.08)' : 'rgba(201,122,85,.08)',
                }}>
                  {mod.node_role === 'start' ? 'Starting Mission' : 'Final Boss'}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="secondary" size="sm" onClick={openEditModule}>Edit</Button>
            <Button variant="danger" size="sm" onClick={handleDeleteModule}>Delete</Button>
          </div>
        </div>
      </div>

      {/* Section tab bar */}
      <div className="flex border-b mb-5" style={{ borderColor: 'var(--rule)' }}>
        {(['submodules', 'overview', 'dependencies'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveSection(t)}
            className="px-5 py-2.5 text-sm font-semibold capitalize transition-colors"
            style={{
              color: activeSection === t ? 'var(--gold)' : 'var(--ink-3)',
              borderBottom: activeSection === t ? '2px solid var(--gold)' : '2px solid transparent',
              backgroundColor: 'transparent',
            }}
          >
            {t === 'submodules'
              ? `Submodules${modSubmodules.length ? ` (${modSubmodules.length})` : ''}`
              : t === 'dependencies'
              ? `Dependencies${prereqs.length + dependents.length ? ` (${prereqs.length + dependents.length})` : ''}`
              : 'Overview'}
          </button>
        ))}
      </div>

      {/* ===== SUBMODULES SECTION ===== */}
      {activeSection === 'submodules' && (
        <div className="cm-detail-body">
          <div className="cm-section">
            <div className="cm-section-head">
              <span className="cm-section-title">Submodules</span>
              <div className="cm-section-rule" />
              <Button variant="primary" size="sm" onClick={openAddSubmodule}>+ Add</Button>
            </div>

            {modSubmodules.length === 0 ? (
              <p className="cm-empty is-inline">No submodules yet. Add a location or story beat.</p>
            ) : (
              <div className="cm-submodule-list">
                {modSubmodules.map(sub => {
                  const ts = getTypeStyle(sub.submodule_type);
                  const isSubExpanded = expandedSubId === sub.id;
                  const subScenes = scenes.filter(sc => sc.submodule_id === sub.id);

                  return (
                    <div
                      key={sub.id}
                      className={`cm-submodule${isSubExpanded ? ' is-expanded' : ''}`}
                    >
                      {/* Submodule header */}
                      <div className="cm-submodule-head">
                        <div
                          className="cm-submodule-head-left"
                          onClick={() => setExpandedSubId(isSubExpanded ? null : sub.id)}
                        >
                          <div className="cm-submodule-meta">
                            <span className="cm-submodule-chevron">▶</span>
                            <span className="cm-tag" style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border + '88', textTransform: 'capitalize' }}>
                              {sub.submodule_type ?? 'other'}
                            </span>
                            <span className="cm-submodule-title">{sub.title}</span>
                            {subScenes.length > 0 && (
                              <span className="cm-tag" style={{ color: 'var(--ink-3)' }}>
                                {subScenes.length} scene{subScenes.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {sub.summary && (
                            <p className="cm-submodule-summary">
                              {sub.summary.substring(0, isSubExpanded ? undefined : 180)}{!isSubExpanded && sub.summary.length > 180 ? '…' : ''}
                            </p>
                          )}
                        </div>
                        <div className="cm-submodule-actions">
                          <button
                            onClick={() => setViewingSubmodule(sub)}
                            className="cm-top-btn"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            View
                          </button>
                          <button
                            onClick={() => openEditSubmodule(sub)}
                            className="cm-top-btn"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteSubmodule(sub)}
                            className="cm-top-btn"
                            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--accent)' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Expanded body */}
                      {isSubExpanded && (
                        <div className="cm-submodule-body">

                          {/* Linked Stat Sheets */}
                          {(() => {
                            const linkedIds = parseLinkedIds(sub.linked_monster_ids);
                            const linked = linkedIds
                              .map(id => monsterStatblocks.find(m => m.id === id))
                              .filter((m): m is MonsterStatblock => !!m);
                            return (
                              <div className="cm-submodule-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span className="cm-section-title">Linked Stat Sheets</span>
                                  <button
                                    className="cm-top-btn"
                                    style={{ fontSize: 11, padding: '3px 9px' }}
                                    onClick={() => setCreaturePickerTarget({ kind: 'submodule', item: sub })}
                                  >
                                    + Link
                                  </button>
                                </div>
                                {linked.length === 0 ? (
                                  <p className="cm-empty-inline">No stat sheets linked.</p>
                                ) : (
                                  <div className="cm-chip-list">
                                    {linked.map(m => {
                                      const cs = getTypeStyle(m.creature_type);
                                      return (
                                        <span key={m.id} className="cm-chip" style={{ borderColor: cs.border + '88' }}>
                                          <span className="cm-chip-glyph" style={{ color: cs.text }}>☠</span>
                                          <button onClick={() => setViewingLinkedCreature(m)} style={{ color: cs.text }}>
                                            {m.name}{m.challenge_rating ? ` CR${m.challenge_rating}` : ''}
                                          </button>
                                          <button
                                            onClick={() => handleUnlinkCreature({ kind: 'submodule', item: sub }, m.id)}
                                            style={{ color: 'var(--ink-3)', marginLeft: 2 }}
                                            title="Unlink"
                                          >
                                            ✕
                                          </button>
                                        </span>
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
                            const diffText: Record<string, string> = {
                              easy: '#6ab87a', medium: '#d0c060', hard: '#e09050', deadly: '#e04040',
                            };
                            return (
                              <div className="cm-submodule-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span className="cm-section-title">Linked Encounters</span>
                                  <button
                                    className="cm-top-btn"
                                    style={{ fontSize: 11, padding: '3px 9px' }}
                                    onClick={() => setEncounterPickerSubId(sub.id)}
                                  >
                                    + Link
                                  </button>
                                </div>
                                {linked.length === 0 ? (
                                  <p className="cm-empty-inline">No encounters linked.</p>
                                ) : (
                                  <div className="cm-chip-list">
                                    {linked.map(enc => {
                                      const col = diffText[enc.difficulty ?? ''] ?? 'var(--ink-2)';
                                      return (
                                        <span key={enc.id} className="cm-chip">
                                          <span className="cm-chip-glyph" style={{ color: col }}>⚔</span>
                                          <button onClick={() => setViewingLinkedEncounter(enc)} style={{ color: col }}>
                                            {enc.name}{enc.difficulty ? ` (${enc.difficulty})` : ''}
                                          </button>
                                          <button
                                            onClick={() => handleUnlinkEncounter(sub, enc.id)}
                                            style={{ color: 'var(--ink-3)', marginLeft: 2 }}
                                            title="Unlink"
                                          >
                                            ✕
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Submodule Dependencies */}
                          {(() => {
                            const subPrereqs = submoduleDeps.filter(d => d.dependent_id === sub.id);
                            const subDependents = submoduleDeps.filter(d => d.prerequisite_id === sub.id);
                            const availableSubs = modSubmodules.filter(
                              s => s.id !== sub.id && !subPrereqs.find(d => d.prerequisite_id === s.id),
                            );
                            return (
                              <div className="cm-submodule-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span className="cm-section-title">Dependencies</span>
                                  <button
                                    className="cm-top-btn"
                                    style={{ fontSize: 11, padding: '3px 9px' }}
                                    onClick={() => openAddSubDep(sub.id)}
                                  >
                                    + Add
                                  </button>
                                </div>
                                {subPrereqs.length === 0 && subDependents.length === 0 ? (
                                  <p className="cm-empty-inline">No dependencies.</p>
                                ) : (
                                  <div className="cm-dep-list">
                                    {subPrereqs.map(dep => {
                                      const prereqSub = modSubmodules.find(s => s.id === dep.prerequisite_id);
                                      if (!prereqSub) return null;
                                      return (
                                        <div key={dep.id} className="cm-dep-row">
                                          <span style={{ color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--mono)' }}>needs</span>
                                          <span className={`cm-dep-badge cm-dep-badge-${dep.dependency_type === 'required' ? 'and' : 'or'}`}>
                                            {dep.dependency_type === 'required' ? 'AND' : 'OR'}
                                          </span>
                                          <span style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 14, color: 'var(--ink)' }}>{prereqSub.title}</span>
                                          <button
                                            onClick={() => deleteSubmoduleDep(dep.id)}
                                            style={{ color: 'var(--accent)', fontSize: 12 }}
                                            title="Remove"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {subDependents.map(dep => {
                                      const depSub = modSubmodules.find(s => s.id === dep.dependent_id);
                                      if (!depSub) return null;
                                      return (
                                        <div key={dep.id} className="cm-dep-row">
                                          <span style={{ color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--mono)' }}>blocks</span>
                                          <span style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 14, color: 'var(--ink)' }}>{depSub.title}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {subDepModalSubId === sub.id && (
                                  <Modal
                                    isOpen
                                    onClose={() => setSubDepModalSubId(null)}
                                    title="Add Submodule Dependency"
                                    onSave={handleSaveSubDep}
                                  >
                                    <FormField label="This submodule needs...">
                                      <select
                                        value={subDepForm.prerequisite_id}
                                        onChange={e => setSubDepForm(prev => ({ ...prev, prerequisite_id: e.target.value }))}
                                        style={inputStyle}
                                      >
                                        <option value="">Select a submodule…</option>
                                        {availableSubs.map(s => (
                                          <option key={s.id} value={s.id}>{s.title}</option>
                                        ))}
                                      </select>
                                    </FormField>
                                    <FormField label="Dependency Type">
                                      <div className="flex gap-4 mt-1">
                                        {(['required', 'optional'] as const).map(t => (
                                          <label key={t} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                              type="radio"
                                              name="subDepType"
                                              value={t}
                                              checked={subDepForm.dependency_type === t}
                                              onChange={() => setSubDepForm(prev => ({ ...prev, dependency_type: t, group_id: '' }))}
                                            />
                                            <span className="text-sm capitalize" style={{ color: 'var(--ink)' }}>
                                              {t === 'required' ? 'Required (AND)' : 'Optional (OR)'}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    </FormField>
                                    <FormField label="Label (optional)">
                                      <input
                                        type="text"
                                        value={subDepForm.label}
                                        onChange={e => setSubDepForm(prev => ({ ...prev, label: e.target.value }))}
                                        placeholder="e.g., Must finish before this location opens"
                                        style={inputStyle}
                                      />
                                    </FormField>
                                    {subDepError && (
                                      <p className="text-sm mt-2" style={{ color: 'var(--accent)' }}>{subDepError}</p>
                                    )}
                                  </Modal>
                                )}
                              </div>
                            );
                          })()}

                          {/* Scenes */}
                          <div className="cm-submodule-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <span className="cm-section-title">Scenes</span>
                              <Button variant="primary" size="sm" onClick={() => openAddScene(sub.id)}>+ Add Scene</Button>
                            </div>
                            {subScenes.length === 0 ? (
                              <p className="cm-empty-inline">No scenes yet.</p>
                            ) : (
                              <div className="cm-scene-list">
                                {subScenes.map((scene, idx) => {
                                  const scs = getTypeStyle(scene.scene_type);
                                  const linkedCreatureIds = parseLinkedIds(scene.linked_monster_ids);
                                  const linkedCreatures = linkedCreatureIds
                                    .map(id => monsterStatblocks.find(m => m.id === id))
                                    .filter((m): m is MonsterStatblock => !!m);
                                  return (
                                    <div key={scene.id} className="cm-scene">
                                      <div className="cm-scene-num">{idx + 1}</div>
                                      <div className="cm-scene-body">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                                          <span className="cm-tag" style={{ backgroundColor: scs.bg, color: scs.text, borderColor: scs.border + '88', textTransform: 'capitalize' }}>
                                            {scene.scene_type ?? 'other'}
                                          </span>
                                          <span className="cm-scene-title">{scene.title}</span>
                                        </div>
                                        {scene.summary && (
                                          <p className="cm-scene-summary">
                                            {scene.summary.substring(0, 140)}{scene.summary.length > 140 ? '…' : ''}
                                          </p>
                                        )}
                                        {linkedCreatures.length > 0 && (
                                          <div className="cm-chip-list" style={{ marginTop: 6 }}>
                                            {linkedCreatures.map(m => {
                                              const cs = getTypeStyle(m.creature_type);
                                              return (
                                                <span key={m.id} className="cm-chip" style={{ borderColor: cs.border + '88' }}>
                                                  <span className="cm-chip-glyph" style={{ color: cs.text }}>☠</span>
                                                  <button onClick={() => setViewingLinkedCreature(m)} style={{ color: cs.text }}>
                                                    {m.name}{m.challenge_rating ? ` CR${m.challenge_rating}` : ''}
                                                  </button>
                                                  <button
                                                    onClick={() => handleUnlinkCreature({ kind: 'scene', item: scene }, m.id)}
                                                    style={{ color: 'var(--ink-3)', marginLeft: 2 }}
                                                    title="Unlink"
                                                  >
                                                    ✕
                                                  </button>
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      <div className="cm-scene-actions">
                                        <button
                                          onClick={() => setCreaturePickerTarget({ kind: 'scene', item: scene })}
                                          className="cm-top-btn"
                                          style={{ fontSize: 11, padding: '3px 8px' }}
                                          title="Link stat sheet"
                                        >
                                          + Stat
                                        </button>
                                        <button
                                          onClick={() => setViewingScene(scene)}
                                          className="cm-top-btn"
                                          style={{ fontSize: 11, padding: '3px 8px' }}
                                        >
                                          View
                                        </button>
                                        <button
                                          onClick={() => openEditScene(scene)}
                                          className="cm-top-btn"
                                          style={{ fontSize: 11, padding: '3px 8px' }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleDeleteScene(scene)}
                                          className="cm-top-btn"
                                          style={{ fontSize: 11, padding: '3px 8px', color: 'var(--accent)' }}
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

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== OVERVIEW SECTION ===== */}
      {activeSection === 'overview' && (
        <div className="cm-detail-body">
          {mod.synopsis && (
            <div className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-title">Synopsis</span>
                <div className="cm-section-rule" />
              </div>
              <MarkdownContent text={mod.synopsis} className="cm-prose" style={{ lineHeight: '1.75', fontSize: '15px' }} />
            </div>
          )}
          {mod.encounters && (
            <div className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-title">Encounters &amp; Story Beats</span>
                <div className="cm-section-rule" />
              </div>
              <MarkdownContent text={mod.encounters} className="cm-prose" style={{ lineHeight: '1.75', fontSize: '15px' }} />
            </div>
          )}
          {mod.rewards && (
            <div className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-title">Rewards</span>
                <div className="cm-section-rule" />
              </div>
              <MarkdownContent text={mod.rewards} className="cm-prose" style={{ lineHeight: '1.75', fontSize: '15px' }} />
            </div>
          )}
          {mod.dm_notes && (
            <div className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-title">DM Notes</span>
                <div className="cm-section-rule" />
              </div>
              <blockquote className="cm-detail-note">
                <MarkdownContent text={mod.dm_notes} style={{ lineHeight: '1.7', fontSize: '14px' }} />
              </blockquote>
            </div>
          )}
          {!mod.synopsis && !mod.encounters && !mod.rewards && !mod.dm_notes && (
            <p className="cm-empty">No details recorded for this module.</p>
          )}
        </div>
      )}

      {/* ===== DEPENDENCIES SECTION ===== */}
      {activeSection === 'dependencies' && (
        <div className="cm-detail-body">

          {/* Depends On (prerequisites) */}
          <div className="cm-section">
            <div className="cm-section-head">
              <span className="cm-section-title">Depends On</span>
              <div className="cm-section-rule" />
              <Button variant="primary" size="sm" onClick={openAddModDep}>+ Add</Button>
            </div>

            {prereqs.length === 0 ? (
              <p className="cm-empty is-inline">No prerequisites — this module can start at any time.</p>
            ) : (
              <div className="cm-dep-list">
                {/* Required (AND) deps */}
                {prereqs.filter(d => d.dependency_type === 'required').map(dep => {
                  const prereqMod = modules.find(m => m.id === dep.prerequisite_id);
                  if (!prereqMod) return null;
                  return (
                    <div key={dep.id} className="cm-dep-row">
                      <span className="cm-dep-badge cm-dep-badge-and">AND</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 15, color: 'var(--ink)' }}>
                          {prereqMod.chapter ? `${prereqMod.chapter}: ` : ''}{prereqMod.title}
                        </span>
                        {dep.label && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic' }}>{dep.label}</span>
                        )}
                      </div>
                      <span className={`cm-tag cm-tag-${prereqMod.status === 'active' ? 'active' : prereqMod.status === 'completed' ? 'muted' : 'planned'}`} style={{ textTransform: 'capitalize', flexShrink: 0 }}>
                        {prereqMod.status}
                      </span>
                      <button
                        onClick={() => deleteModuleDep(dep.id)}
                        className="cm-top-btn"
                        style={{ fontSize: 11, padding: '2px 7px', color: 'var(--accent)', flexShrink: 0 }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}

                {/* Optional (OR) deps grouped */}
                {orGroups.map((gid, gi) => {
                  const group = optionalPrereqs.filter(d => d.group_id === gid);
                  return (
                    <div key={gid} className="cm-dep-or-group">
                      <div className="cm-dep-or-group-head">
                        OR Group {gi + 1} — any one satisfies the requirement
                      </div>
                      <div className="cm-dep-or-group-body">
                        {group.map(dep => {
                          const prereqMod = modules.find(m => m.id === dep.prerequisite_id);
                          if (!prereqMod) return null;
                          return (
                            <div key={dep.id} className="cm-dep-row">
                              <span className="cm-dep-badge cm-dep-badge-or">OR</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontFamily: 'var(--display)', fontSize: 15, color: 'var(--ink)' }}>
                                  {prereqMod.chapter ? `${prereqMod.chapter}: ` : ''}{prereqMod.title}
                                </span>
                                {dep.label && (
                                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic' }}>{dep.label}</span>
                                )}
                              </div>
                              <span className={`cm-tag cm-tag-${prereqMod.status === 'active' ? 'active' : prereqMod.status === 'completed' ? 'muted' : 'planned'}`} style={{ textTransform: 'capitalize', flexShrink: 0 }}>
                                {prereqMod.status}
                              </span>
                              <button
                                onClick={() => deleteModuleDep(dep.id)}
                                className="cm-top-btn"
                                style={{ fontSize: 11, padding: '2px 7px', color: 'var(--accent)', flexShrink: 0 }}
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Required By (reverse view, read-only) */}
          <div className="cm-section">
            <div className="cm-section-head">
              <span className="cm-section-title">Blocks These Modules</span>
              <div className="cm-section-rule" />
            </div>
            {dependents.length === 0 ? (
              <p className="cm-empty is-inline">No modules depend on this one yet.</p>
            ) : (
              <div className="cm-dep-list">
                {dependents.map(dep => {
                  const depMod = modules.find(m => m.id === dep.dependent_id);
                  if (!depMod) return null;
                  return (
                    <div key={dep.id} className="cm-dep-row">
                      <span className={`cm-dep-badge cm-dep-badge-${dep.dependency_type === 'required' ? 'and' : 'or'}`}>
                        {dep.dependency_type === 'required' ? 'AND' : 'OR'}
                      </span>
                      <span style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 15, color: 'var(--ink)' }}>
                        {depMod.chapter ? `${depMod.chapter}: ` : ''}{depMod.title}
                      </span>
                      <span className={`cm-tag cm-tag-${depMod.status === 'active' ? 'active' : depMod.status === 'completed' ? 'muted' : 'planned'}`} style={{ textTransform: 'capitalize', flexShrink: 0 }}>
                        {depMod.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          ADD MODULE DEPENDENCY MODAL
      ================================================================ */}
      <Modal
        isOpen={modDepModalOpen}
        onClose={() => setModDepModalOpen(false)}
        title="Add Module Dependency"
        onSave={handleSaveModDep}
      >
        <FormField label="This module depends on...">
          <select
            value={modDepForm.prerequisite_id}
            onChange={e => setModDepForm(prev => ({ ...prev, prerequisite_id: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Select a module…</option>
            {availableModules.map(m => (
              <option key={m.id} value={m.id}>
                {m.chapter ? `${m.chapter}: ` : ''}{m.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Dependency Type">
          <div className="flex gap-6 mt-1">
            {(['required', 'optional'] as const).map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="modDepType"
                  value={t}
                  checked={modDepForm.dependency_type === t}
                  onChange={() => setModDepForm(prev => ({ ...prev, dependency_type: t, group_id: '' }))}
                />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>
                  {t === 'required' ? 'Required (AND) — must be completed' : 'Optional (OR) — any one in group satisfies'}
                </span>
              </label>
            ))}
          </div>
        </FormField>
        {modDepForm.dependency_type === 'optional' && orGroups.length > 0 && (
          <FormField label="OR Group">
            <select
              value={modDepForm.group_id}
              onChange={e => setModDepForm(prev => ({ ...prev, group_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">New OR group</option>
              {orGroups.map((gid, i) => {
                const members = optionalPrereqs
                  .filter(d => d.group_id === gid)
                  .map(d => modules.find(m => m.id === d.prerequisite_id)?.title ?? '?')
                  .join(', ');
                return (
                  <option key={gid} value={gid}>
                    OR Group {i + 1}: {members}
                  </option>
                );
              })}
            </select>
          </FormField>
        )}
        <FormField label="Label (optional)">
          <input
            type="text"
            value={modDepForm.label}
            onChange={e => setModDepForm(prev => ({ ...prev, label: e.target.value }))}
            placeholder="e.g., Complete before the heist"
            style={inputStyle}
          />
        </FormField>
        {modDepError && (
          <p className="text-sm mt-2" style={{ color: '#e05c5c' }}>{modDepError}</p>
        )}
      </Modal>

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
          <FormField label="Module ID">
            <input
              type="number"
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
        <FormField label="Name">
          <input
            type="text"
            value={moduleForm.title}
            onChange={e => setModuleForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., The Train Heist"
            style={inputStyle}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Faction / Storyline">
            <select value={moduleForm.faction_id ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, faction_id: e.target.value || null }))} style={inputStyle}>
              <option value="">-- No Faction --</option>
              {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormField>
          <FormField label="Node Role">
            <select value={moduleForm.node_role ?? ''} onChange={e => setModuleForm(prev => ({ ...prev, node_role: (e.target.value || null) as 'start' | 'boss' | null }))} style={inputStyle}>
              <option value="">Normal</option>
              <option value="start">Starting Mission</option>
              <option value="boss">Final Boss</option>
            </select>
          </FormField>
        </div>
        <FormField label="Synopsis">
          <MarkdownEditor value={moduleForm.synopsis ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, synopsis: v }))} placeholder="Overview of this chapter's events, goals, and themes..." minHeight="80px" textareaRef={modSynopsisRef} />
          <EntityLinkToolbar textareaRef={modSynopsisRef} onInsert={markup => setModuleForm(prev => ({ ...prev, synopsis: insertAtCursor(modSynopsisRef, prev.synopsis ?? '', markup) }))} />
        </FormField>
        <FormField label="Encounters & Story Beats">
          <MarkdownEditor value={moduleForm.encounters ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, encounters: v }))} placeholder="Key scenes, encounters, revelations, branching paths..." minHeight="120px" textareaRef={modEncountersRef} />
          <EntityLinkToolbar textareaRef={modEncountersRef} onInsert={markup => setModuleForm(prev => ({ ...prev, encounters: insertAtCursor(modEncountersRef, prev.encounters ?? '', markup) }))} />
        </FormField>
        <FormField label="Rewards">
          <MarkdownEditor value={moduleForm.rewards ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, rewards: v }))} placeholder="Loot, level-ups, plot rewards..." minHeight="60px" textareaRef={modRewardsRef} />
          <EntityLinkToolbar textareaRef={modRewardsRef} onInsert={markup => setModuleForm(prev => ({ ...prev, rewards: insertAtCursor(modRewardsRef, prev.rewards ?? '', markup) }))} />
        </FormField>
        <FormField label="DM Notes">
          <MarkdownEditor value={moduleForm.dm_notes ?? ''} onChange={v => setModuleForm(prev => ({ ...prev, dm_notes: v }))} placeholder="Hidden information, fallbacks, secret motives..." minHeight="60px" textareaRef={modDmNotesRef} />
          <EntityLinkToolbar textareaRef={modDmNotesRef} onInsert={markup => setModuleForm(prev => ({ ...prev, dm_notes: insertAtCursor(modDmNotesRef, prev.dm_notes ?? '', markup) }))} />
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
          <MarkdownEditor value={subForm.summary} onChange={v => setSubForm(prev => ({ ...prev, summary: v }))} placeholder="Short description shown in the list view..." minHeight="60px" textareaRef={subSummaryRef} />
          <EntityLinkToolbar textareaRef={subSummaryRef} onInsert={markup => setSubForm(prev => ({ ...prev, summary: insertAtCursor(subSummaryRef, prev.summary, markup) }))} />
        </FormField>
        <FormField label="Full Write-Up">
          <MarkdownEditor value={subForm.content} onChange={v => setSubForm(prev => ({ ...prev, content: v }))} placeholder="Full description of this location or story beat — history, atmosphere, key details, DM guidance..." minHeight="320px" textareaRef={subContentRef} />
          <EntityLinkToolbar textareaRef={subContentRef} onInsert={markup => setSubForm(prev => ({ ...prev, content: insertAtCursor(subContentRef, prev.content, markup) }))} />
        </FormField>
        <FormField label="DM Notes">
          <MarkdownEditor value={subForm.dm_notes} onChange={v => setSubForm(prev => ({ ...prev, dm_notes: v }))} placeholder="Hidden info, contingencies, secrets..." minHeight="60px" textareaRef={subDmNotesRef} />
          <EntityLinkToolbar textareaRef={subDmNotesRef} onInsert={markup => setSubForm(prev => ({ ...prev, dm_notes: insertAtCursor(subDmNotesRef, prev.dm_notes, markup) }))} />
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
          <MarkdownEditor value={sceneForm.summary} onChange={v => setSceneForm(prev => ({ ...prev, summary: v }))} placeholder="Short description shown in the list view..." minHeight="60px" textareaRef={sceneSummaryRef} />
          <EntityLinkToolbar textareaRef={sceneSummaryRef} onInsert={markup => setSceneForm(prev => ({ ...prev, summary: insertAtCursor(sceneSummaryRef, prev.summary, markup) }))} />
        </FormField>
        <FormField label="Full Write-Up">
          <MarkdownEditor value={sceneForm.content} onChange={v => setSceneForm(prev => ({ ...prev, content: v }))} placeholder="Full scene details — read-aloud text, tactics, trigger conditions, outcomes, branching paths..." minHeight="320px" textareaRef={sceneContentRef} />
          <EntityLinkToolbar textareaRef={sceneContentRef} onInsert={markup => setSceneForm(prev => ({ ...prev, content: insertAtCursor(sceneContentRef, prev.content, markup) }))} />
        </FormField>
        <FormField label="DM Notes">
          <MarkdownEditor value={sceneForm.dm_notes} onChange={v => setSceneForm(prev => ({ ...prev, dm_notes: v }))} placeholder="Hidden info, contingencies, secrets..." minHeight="60px" textareaRef={sceneDmNotesRef} />
          <EntityLinkToolbar textareaRef={sceneDmNotesRef} onInsert={markup => setSceneForm(prev => ({ ...prev, dm_notes: insertAtCursor(sceneDmNotesRef, prev.dm_notes, markup) }))} />
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
                <MarkdownContent text={viewingSubmodule.summary} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }} />
              </div>
            )}
            {viewingSubmodule.content && (
              <div>
                <div style={sectionLabel}>Full Write-Up</div>
                <MarkdownContent text={viewingSubmodule.content} className="text-sm" style={{ color: 'var(--ink)', lineHeight: '1.8', fontFamily: 'var(--display)' }} />
              </div>
            )}
            {viewingSubmodule.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <MarkdownContent text={viewingSubmodule.dm_notes} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }} />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setViewingSubmodule(null); openEditSubmodule(viewingSubmodule); }}
                className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink-2)', border: '1px solid #3a3660' }}
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
                <MarkdownContent text={viewingScene.summary} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }} />
              </div>
            )}
            {viewingScene.content && (
              <div>
                <div style={sectionLabel}>Full Write-Up</div>
                <MarkdownContent text={viewingScene.content} className="text-sm" style={{ color: 'var(--ink)', lineHeight: '1.8', fontFamily: 'var(--display)' }} />
              </div>
            )}
            {viewingScene.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <MarkdownContent text={viewingScene.dm_notes} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }} />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setViewingScene(null); openEditScene(viewingScene); }}
                className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink-2)', border: '1px solid #3a3660' }}
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
          title="Link Stat Sheet"
          wide
        >
          <div className="space-y-3">
            {monsterStatblocks.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
                No stat sheets yet. Add some from the Stat Sheets tab first.
              </p>
            ) : (
              <>
                <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                  Select a stat sheet to link to this {creaturePickerTarget.kind}.
                  Linked stat sheets are shown inline when viewing it.
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
                        style={{ backgroundColor: 'var(--paper)', borderColor: alreadyLinked ? ts.border : 'var(--rule)' }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded border capitalize shrink-0"
                            style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                          >
                            {m.creature_type ?? 'other'}
                          </span>
                          <span className="text-sm font-medium" style={{ color: 'var(--ink)', fontFamily: 'var(--display)' }}>
                            {m.name}
                          </span>
                          {m.challenge_rating && (
                            <span className="text-xs" style={{ color: 'var(--ink-2)' }}>CR {m.challenge_rating}</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleLinkCreature(m.id)}
                          disabled={alreadyLinked}
                          className="text-xs px-3 py-1 rounded shrink-0 disabled:opacity-50"
                          style={{
                            backgroundColor: alreadyLinked ? 'var(--paper)' : '#a07830',
                            color: alreadyLinked ? 'var(--ink-3)' : 'var(--ink)',
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
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{viewingLinkedCreature.tags}</span>
              )}
            </div>
            {viewingLinkedCreature.content && (
              <div>
                <div style={sectionLabel}>Stat Block</div>
                <pre
                  className="text-sm whitespace-pre-wrap rounded p-3"
                  style={{
                    color: 'var(--ink)',
                    lineHeight: '1.7',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    backgroundColor: 'var(--bg)',
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
                <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingLinkedCreature.dm_notes}
                </p>
              </div>
            )}
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
            <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
              Select an encounter to link to this submodule.
              Linked encounters are shown inline when viewing it.
            </p>
            {encounters.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
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
                  const dc = diffColors[enc.difficulty ?? ''] ?? { bg: 'var(--paper)', text: 'var(--ink-2)', border: 'var(--rule)' };
                  return (
                    <button
                      key={enc.id}
                      onClick={() => !alreadyLinked && handleLinkEncounter(enc.id)}
                      disabled={alreadyLinked}
                      className="w-full text-left rounded border p-3 flex items-center justify-between gap-3"
                      style={{
                        backgroundColor: alreadyLinked ? 'var(--paper)' : dc.bg,
                        borderColor: alreadyLinked ? 'var(--rule)' : dc.border,
                        opacity: alreadyLinked ? 0.5 : 1,
                        cursor: alreadyLinked ? 'default' : 'pointer',
                      }}
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium block" style={{ color: 'var(--ink)', fontFamily: 'var(--display)' }}>
                          {enc.name}
                        </span>
                        {(enc.difficulty || enc.environment) && (
                          <span className="text-xs" style={{ color: dc.text }}>
                            {[enc.difficulty, enc.environment].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      {alreadyLinked && (
                        <span className="text-xs shrink-0" style={{ color: 'var(--ink-3)' }}>linked</span>
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
                  backgroundColor: { easy: '#1a2a1a', medium: '#2a2a1a', hard: '#3a2010', deadly: '#3a1010' }[viewingLinkedEncounter.difficulty] ?? 'var(--paper)',
                  color: { easy: '#6ab87a', medium: '#d0c060', hard: '#e09050', deadly: '#e04040' }[viewingLinkedEncounter.difficulty] ?? 'var(--ink-2)',
                  borderColor: { easy: '#2a5a2a', medium: '#6a6020', hard: '#7a4a20', deadly: '#7a2020' }[viewingLinkedEncounter.difficulty] ?? 'var(--rule)',
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
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
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
                <p className="text-sm" style={{ color: 'var(--ink)', lineHeight: '1.7' }}>
                  {viewingLinkedEncounter.description}
                </p>
              </div>
            )}
            {viewingLinkedEncounter.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }}>
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
