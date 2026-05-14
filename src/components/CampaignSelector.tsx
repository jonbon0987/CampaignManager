import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { Modal } from './Modal';
import { FormField, inputStyle, textareaStyle } from './FormField';
import { Button } from './ui/Button';

export default function CampaignSelector() {
  const { campaigns, selectedCampaignId, selectedCampaign, createCampaign, updateCampaign, deleteCampaign, switchCampaign } = useCampaign();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const campaign = await createCampaign(newName.trim(), newDescription.trim() || undefined);
    switchCampaign(campaign.id);
    setCreateModalOpen(false);
    setNewName('');
    setNewDescription('');
  };

  const handleOpenEdit = () => {
    if (!selectedCampaign) return;
    setEditName(selectedCampaign.name);
    setEditDescription(selectedCampaign.description ?? '');
    setDropdownOpen(false);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCampaignId || !editName.trim()) return;
    await updateCampaign(selectedCampaignId, {
      name: editName.trim(),
      description: editDescription.trim() || null,
    });
    setEditModalOpen(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteCampaign(deleteTarget.id);
    setDeleteTarget(null);
    setDropdownOpen(false);
  };

  const displayName = selectedCampaign?.name || 'New Campaign';

  return (
    <div className="flex-1 relative" ref={dropdownRef}>
      {/* Campaign name row */}
      <div className="flex items-center gap-1 group">
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          className="flex items-center gap-1"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span
            style={{ color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', display: 'inline-block' }}
          >
            {displayName}
          </span>
          <span
            className="text-xs transition-transform"
            style={{
              color: 'var(--ink-3)',
              transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
              fontSize: '10px',
            }}
          >
            ▾
          </span>
        </button>
        <button
          onClick={handleOpenEdit}
          className="text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--ink-3)', border: '1px solid var(--rule)', marginLeft: '2px', backgroundColor: 'transparent', fontSize: '10px' }}
          title="Rename campaign"
        >
          ✎
        </button>
      </div>

      {/* Dropdown */}
      {dropdownOpen && (
        <div
          className="absolute left-0 top-full mt-1 rounded-lg border z-50 py-1"
          style={{ backgroundColor: 'var(--paper)', borderColor: 'var(--rule)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: '200px', maxWidth: 'calc(100vw - 2rem)' }}
        >
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderBottom: '1px solid var(--rule-soft)' }}
            >
              <button
                onClick={() => { switchCampaign(campaign.id); setDropdownOpen(false); }}
                className="flex-1 text-left text-sm truncate"
                style={{
                  color: campaign.id === selectedCampaignId ? 'var(--gold)' : 'var(--ink)',
                  fontWeight: campaign.id === selectedCampaignId ? 'bold' : 'normal',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {campaign.id === selectedCampaignId && (
                  <span style={{ color: 'var(--gold)', marginRight: '6px' }}>✓</span>
                )}
                {campaign.name || 'New Campaign'}
              </button>
              {campaign.id !== selectedCampaignId && (
                <button
                  onClick={() => { setDropdownOpen(false); setDeleteTarget({ id: campaign.id, name: campaign.name || 'New Campaign' }); }}
                  className="text-xs px-1.5 py-0.5 rounded shrink-0 transition-colors"
                  style={{ color: 'var(--accent)', border: '1px solid var(--rule)', background: 'none', cursor: 'pointer' }}
                  title={`Delete "${campaign.name}"`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* New Campaign button */}
          <button
            onClick={() => { setDropdownOpen(false); setCreateModalOpen(true); }}
            className="w-full text-left text-sm px-3 py-2 transition-colors text-muted hover:text-gold"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            + New Campaign
          </button>
        </div>
      )}

      {/* Create Campaign Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => { setCreateModalOpen(false); setNewName(''); setNewDescription(''); }}
        title="New Campaign"
        onSave={handleCreate}
      >
        <FormField label="Campaign Name">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g., The Sunken Citadel"
            style={inputStyle}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
        </FormField>
        <FormField label="Description (optional)">
          <textarea
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder="A short description of this campaign..."
            style={{ ...textareaStyle, minHeight: '70px' }}
          />
        </FormField>
      </Modal>

      {/* Edit Campaign Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Rename Campaign"
        onSave={handleSaveEdit}
      >
        <FormField label="Campaign Name">
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="e.g., The Sunken Citadel"
            style={inputStyle}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); }}
          />
        </FormField>
        <FormField label="Description (optional)">
          <textarea
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            placeholder="A short description of this campaign..."
            style={{ ...textareaStyle, minHeight: '70px' }}
          />
        </FormField>
      </Modal>

      {/* Delete Campaign Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Campaign"
      >
        <p className="text-sm mb-3" style={{ color: 'var(--ink)' }}>
          Are you sure you want to delete <strong style={{ color: 'var(--gold)' }}>{deleteTarget?.name}</strong>?
        </p>
        <p className="text-sm mb-5" style={{ color: 'var(--ink-2)' }}>
          This will permanently delete all sessions, characters, modules, hooks, and factions belonging to this campaign. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteConfirm} style={{ backgroundColor: '#6a2a2a', borderColor: '#6a2a2a', color: 'var(--ink)' }}>Delete Campaign</Button>
        </div>
      </Modal>
    </div>
  );
}
