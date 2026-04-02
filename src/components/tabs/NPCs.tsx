import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { NPC } from '../../lib/database.types';

type NPCForm = {
  name: string;
  role: string | null;
  affiliation: string | null;
  status: NPC['status'];
  description: string | null;
  hooks_motivations: string | null;
  met_by_pcs: boolean;
};

const emptyForm = (): NPCForm => ({
  name: '',
  role: '',
  affiliation: '',
  status: 'active',
  description: '',
  hooks_motivations: '',
  met_by_pcs: false,
});

const statusStyles: Record<NPC['status'], { bg: string; text: string }> = {
  active:   { bg: '#1a3a1a', text: '#4caf7d' },
  deceased: { bg: '#3a1a1a', text: '#e05c5c' },
  unknown:  { bg: '#2a2a1a', text: '#c9a84c' },
};

type ViewMode = 'campaign' | 'global';

export default function NPCs() {
  const {
    npcs, globalNPCs, linkedNPCIds,
    upsertNPC, deleteNPC, linkNPCToCampaign, unlinkNPCFromCampaign,
  } = useCampaign();

  const [viewMode, setViewMode] = useState<ViewMode>('campaign');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNPC, setEditingNPC] = useState<NPC | null>(null);
  const [form, setForm] = useState<NPCForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  // In campaign view: show campaign-specific + linked globals (the merged npcs array)
  // In global view: show all global NPCs
  const displayList = viewMode === 'campaign' ? npcs : globalNPCs;

  const filtered = displayList.filter(npc => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      npc.name.toLowerCase().includes(q) ||
      (npc.role ?? '').toLowerCase().includes(q) ||
      (npc.description ?? '').toLowerCase().includes(q)
    );
  });

  // Global NPCs not yet linked to this campaign (for the link picker)
  const unlinkableGlobals = globalNPCs.filter(n => linkedNPCIds.includes(n.id));
  const linkableGlobals = globalNPCs.filter(
    n => !linkedNPCIds.includes(n.id) &&
    (linkSearch
      ? n.name.toLowerCase().includes(linkSearch.toLowerCase()) ||
        (n.role ?? '').toLowerCase().includes(linkSearch.toLowerCase())
      : true)
  );

  const openAdd = () => {
    setEditingNPC(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (npc: NPC) => {
    setEditingNPC(npc);
    setForm({
      name: npc.name,
      role: npc.role,
      affiliation: npc.affiliation,
      status: npc.status,
      description: npc.description,
      hooks_motivations: npc.hooks_motivations,
      met_by_pcs: npc.met_by_pcs,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    // When editing an existing NPC, preserve its scope (global or campaign-specific)
    const scope = editingNPC
      ? (editingNPC.campaign_id === null ? 'global' : 'campaign')
      : viewMode;
    await upsertNPC({
      ...(editingNPC ? { id: editingNPC.id } : {}),
      ...form,
      dm_notes: editingNPC?.dm_notes ?? null,
      location: editingNPC?.location ?? null,
      first_session: editingNPC?.first_session ?? null,
    }, scope);
    setModalOpen(false);
  };

  const handleToggleMet = async (npc: NPC) => {
    const scope = npc.campaign_id === null ? 'global' : 'campaign';
    await upsertNPC({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      affiliation: npc.affiliation,
      status: npc.status,
      description: npc.description,
      hooks_motivations: npc.hooks_motivations,
      dm_notes: npc.dm_notes,
      location: npc.location,
      first_session: npc.first_session,
      met_by_pcs: !npc.met_by_pcs,
    }, scope);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this NPC?')) {
      await deleteNPC(id);
      if (expandedId === id) setExpandedId(null);
    }
  };

  const handleLink = async (npcId: string) => {
    await linkNPCToCampaign(npcId);
  };

  const handleUnlink = async (npcId: string) => {
    if (confirm('Remove this NPC from the current campaign? It will remain in the Global Pool.')) {
      await unlinkNPCFromCampaign(npcId);
    }
  };

  const subtabStyle = (active: boolean) => ({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: active ? '600' : '400',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? '#2a2840' : 'transparent',
    color: active ? '#c9a84c' : '#9990b0',
    transition: 'all 0.15s',
  } as const);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Non-Player Characters
        </h2>
        <div className="flex items-center gap-2">
          {viewMode === 'campaign' && (
            <button
              onClick={() => setLinkPickerOpen(true)}
              className="px-3 py-2 rounded text-sm transition-colors"
              style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#c9a84c')}
              onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
            >
              Link Global NPC
            </button>
          )}
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
          >
            + Add NPC
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-lg inline-flex" style={{ backgroundColor: '#12111e' }}>
        <button style={subtabStyle(viewMode === 'campaign')} onClick={() => setViewMode('campaign')}>
          This Campaign
        </button>
        <button style={subtabStyle(viewMode === 'global')} onClick={() => setViewMode('global')}>
          Global Pool
        </button>
      </div>

      {viewMode === 'global' && (
        <p className="text-xs mb-4" style={{ color: '#6a6490' }}>
          Global NPCs are world-level characters available across all campaigns. Use "Add to Campaign" to include one in the current campaign.
        </p>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search NPCs by name, role, or description..."
          style={{ ...inputStyle, maxWidth: '420px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {search
            ? 'No NPCs match your search.'
            : viewMode === 'campaign'
              ? 'No NPCs in this campaign yet. Add one or link from the Global Pool.'
              : 'No global NPCs yet. Add your first global NPC!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(npc => {
            const ss = statusStyles[npc.status];
            const isGlobal = npc.campaign_id === null;
            const isLinked = isGlobal && linkedNPCIds.includes(npc.id);
            return (
              <div
                key={npc.id}
                className="rounded-lg border flex flex-col"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                <div
                  className="p-4 cursor-pointer flex-1"
                  onClick={() => setExpandedId(expandedId === npc.id ? null : npc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                          {npc.name || 'Unnamed NPC'}
                        </h3>
                        {isGlobal && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: '#1a2a3a', color: '#4ab8d4', border: '1px solid #2a4a6a', flexShrink: 0 }}
                          >
                            Global
                          </span>
                        )}
                      </div>
                      {npc.role && (
                        <div className="text-sm mt-0.5" style={{ color: '#9990b0' }}>{npc.role}</div>
                      )}
                      {npc.affiliation && (
                        <div className="text-xs mt-0.5" style={{ color: '#6a6490' }}>{npc.affiliation}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className="text-xs px-2 py-0.5 rounded capitalize"
                        style={{ backgroundColor: ss.bg, color: ss.text }}
                      >
                        {npc.status}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleMet(npc); }}
                        className="text-xs px-2 py-0.5 rounded transition-colors"
                        title={npc.met_by_pcs ? 'PCs have met this NPC' : 'PCs have not met this NPC'}
                        style={{
                          backgroundColor: npc.met_by_pcs ? '#1a2e3a' : '#22203a',
                          color: npc.met_by_pcs ? '#4ab8d4' : '#4a4870',
                          border: `1px solid ${npc.met_by_pcs ? '#2a6080' : '#3a3660'}`,
                        }}
                      >
                        {npc.met_by_pcs ? 'Met' : 'Unmet'}
                      </button>
                      <span className="text-xs ml-1" style={{ color: '#6a6490' }}>
                        {expandedId === npc.id ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {npc.description && (
                    <p className="text-sm mt-2" style={{ color: '#c9b88a', lineHeight: '1.5' }}>
                      {expandedId === npc.id
                        ? npc.description
                        : npc.description.substring(0, 100) + (npc.description.length > 100 ? '...' : '')}
                    </p>
                  )}

                  {expandedId === npc.id && npc.hooks_motivations && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>
                        Hooks & Motivations
                      </div>
                      <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{npc.hooks_motivations}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 p-3 pt-0">
                  <button
                    onClick={() => openEdit(npc)}
                    className="text-xs px-2 py-1 rounded flex-1 transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  {/* Global NPCs in campaign view: show unlink instead of delete */}
                  {viewMode === 'campaign' && isLinked ? (
                    <button
                      onClick={() => handleUnlink(npc.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                      title="Remove from this campaign (keeps in Global Pool)"
                    >
                      Unlink
                    </button>
                  ) : viewMode === 'global' && !isLinked ? (
                    <button
                      onClick={() => handleLink(npc.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ backgroundColor: '#1a2a1a', color: '#4caf7d', border: '1px solid #2a4a2a' }}
                    >
                      Add to Campaign
                    </button>
                  ) : viewMode === 'global' && isLinked ? (
                    <button
                      onClick={() => handleUnlink(npc.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ backgroundColor: '#1a2e3a', color: '#4ab8d4', border: '1px solid #2a4a6a' }}
                    >
                      In Campaign ✓
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDelete(npc.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link Global NPC picker modal */}
      <Modal
        isOpen={linkPickerOpen}
        onClose={() => { setLinkPickerOpen(false); setLinkSearch(''); }}
        title="Link Global NPC to Campaign"
        onSave={undefined}
        wide
      >
        <p className="text-sm mb-3" style={{ color: '#9990b0' }}>
          Select global NPCs to add to this campaign.
          {unlinkableGlobals.length > 0 && ` (${unlinkableGlobals.length} already linked)`}
        </p>
        <input
          type="text"
          value={linkSearch}
          onChange={e => setLinkSearch(e.target.value)}
          placeholder="Search global NPCs..."
          style={{ ...inputStyle, marginBottom: '12px' }}
        />
        {linkableGlobals.length === 0 ? (
          <div className="text-center py-8" style={{ color: '#6a6490' }}>
            {linkSearch ? 'No matches.' : 'All global NPCs are already linked to this campaign.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {linkableGlobals.map(npc => {
              const ss = statusStyles[npc.status];
              return (
                <div
                  key={npc.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ backgroundColor: '#12111e', borderColor: '#3a3660' }}
                >
                  <div>
                    <span className="font-semibold text-sm" style={{ color: '#e8d5b0' }}>{npc.name}</span>
                    {npc.role && <span className="text-xs ml-2" style={{ color: '#9990b0' }}>{npc.role}</span>}
                    <span className="text-xs ml-2 px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: ss.bg, color: ss.text }}>
                      {npc.status}
                    </span>
                  </div>
                  <button
                    onClick={() => handleLink(npc.id)}
                    className="text-xs px-3 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#1a3a1a', color: '#4caf7d', border: '1px solid #2a4a2a' }}
                  >
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Add / Edit NPC modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingNPC ? 'Edit NPC' : (viewMode === 'global' ? 'New Global NPC' : 'New NPC')}
        onSave={handleSave}
        wide
      >
        {!editingNPC && (
          <p className="text-xs mb-4" style={{ color: '#6a6490' }}>
            {viewMode === 'global'
              ? 'Creating a Global NPC — available across all campaigns.'
              : 'Creating a campaign-specific NPC — only visible in this campaign.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name">
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Garrak the Bold"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Role / Title">
            <input
              type="text"
              value={form.role ?? ''}
              onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
              placeholder="e.g., Merchant, Villain, Quest Giver"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Affiliation">
            <input
              type="text"
              value={form.affiliation ?? ''}
              onChange={e => setForm(prev => ({ ...prev, affiliation: e.target.value }))}
              placeholder="e.g., Merchant Guild, City Watch"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value as NPC['status'] }))}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="deceased">Deceased</option>
              <option value="unknown">Unknown</option>
            </select>
          </FormField>
        </div>
        <FormField label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Physical appearance, personality, and first impressions..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Hooks & Motivations">
          <textarea
            value={form.hooks_motivations ?? ''}
            onChange={e => setForm(prev => ({ ...prev, hooks_motivations: e.target.value }))}
            placeholder="Personal goals, secrets, relationships..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
        <FormField label="Met by PCs">
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: '#c9b88a' }}>
            <input
              type="checkbox"
              checked={form.met_by_pcs}
              onChange={e => setForm(prev => ({ ...prev, met_by_pcs: e.target.checked }))}
              style={{ accentColor: '#4ab8d4', width: '16px', height: '16px' }}
            />
            <span className="text-sm">The PCs have met this NPC</span>
          </label>
        </FormField>
      </Modal>
    </div>
  );
}
