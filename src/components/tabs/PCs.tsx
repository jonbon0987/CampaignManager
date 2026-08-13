import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { SectionHeader } from '../ui/SectionHeader';
import { EntityCard } from '../ui/EntityCard';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownContent } from '../ui/MarkdownContent';
import { PCEditModal } from '../PCEditModal';
import { getFactionTypeStyle } from '../../lib/theme';

const labelStyle: React.CSSProperties = {
  color: 'var(--gold)',
  fontSize: '0.65rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export default function PCs() {
  const { pcs, factions, monsterStatblocks } = useCampaign();
  const { openStatBlock } = useStatBlockPanel();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Modal state: null = closed, '__new__' = create, uuid = edit
  const [editModalPcId, setEditModalPcId] = useState<string | null>(null);

  return (
    <div>
      <SectionHeader
        title="Player Characters"
        subtitle={`${pcs.length} character${pcs.length !== 1 ? 's' : ''}`}
        onAdd={() => setEditModalPcId('__new__')}
        addLabel="Add PC"
      />

      {pcs.length === 0 ? (
        <EmptyState message="No player characters yet. Add your first PC!" onAdd={() => setEditModalPcId('__new__')} addLabel="Add PC" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pcs.map(pc => {
            const isExpanded = expandedId === pc.id;

            return (
              <EntityCard key={pc.id}>
                <div
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : pc.id)}
                >
                  <div className="flex items-start justify-between group">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)' }}>
                        {pc.character_name || 'Unnamed'}
                      </h3>
                      <div className="text-sm mt-1" style={{ color: 'var(--gold)' }}>
                        {[pc.race, pc.class].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>
                        Player: {pc.player_name || '—'}
                      </div>
                      {pc.faction_ids && pc.faction_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {pc.faction_ids.map(fid => {
                            const f = factions.find(x => x.id === fid);
                            if (!f) return null;
                            const style = getFactionTypeStyle(f.faction_type);
                            return (
                              <span
                                key={fid}
                                style={{
                                  backgroundColor: style.bg,
                                  color: style.text,
                                  border: `1px solid ${style.border}`,
                                  borderRadius: 'var(--radius)',
                                  padding: '1px 5px',
                                  fontSize: 10,
                                  lineHeight: 1.3,
                                }}
                              >
                                {f.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {pc.statblock_id && (() => {
                        const sb = monsterStatblocks.find(m => m.id === pc.statblock_id);
                        if (!sb) return null;
                        return (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); openStatBlock(sb.id); }}
                              className="text-xs underline"
                              style={{ color: 'var(--info)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                              title="Open stat sheet"
                            >
                              {sb.name}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1">
                      {!pc.is_active && <Badge label="Inactive" color="muted" size="xs" />}
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setEditModalPcId(pc.id); }} title="Edit">
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                      <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--rule)' }}>
                      {pc.background && (
                        <div className="mb-3">
                          <div className="mb-1" style={labelStyle}>Background</div>
                          <MarkdownContent text={pc.background} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }} />
                        </div>
                      )}
                      {pc.story_hooks && (
                        <div className="mb-3">
                          <div className="mb-1" style={labelStyle}>Story Hooks</div>
                          <MarkdownContent text={pc.story_hooks} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }} />
                        </div>
                      )}
                      {pc.key_npcs && (
                        <div className="mb-3">
                          <div className="mb-1" style={labelStyle}>Key NPCs</div>
                          <MarkdownContent text={pc.key_npcs} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }} />
                        </div>
                      )}
                      {!pc.background && !pc.story_hooks && !pc.key_npcs && (
                        <p className="text-sm" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No additional details recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              </EntityCard>
            );
          })}
        </div>
      )}

      <PCEditModal
        isOpen={editModalPcId !== null}
        onClose={() => setEditModalPcId(null)}
        pcId={editModalPcId === '__new__' ? null : editModalPcId}
      />
    </div>
  );
}
