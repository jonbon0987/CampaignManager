import { useState, useMemo, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { OriginBand, type Origin } from '../ui/OriginBand';
import { pushRecent } from '../Sidebar';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from '../ui/OverflowMenu';
import { AutosaveTextarea } from '../ui/MentionButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { ListRowWithHover } from '../HoverPreview';
import type { LoreEntry } from '../../lib/database.types';

const GLYPH = '❦';
const LORE_CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'] as const;

const categoryBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  history: 'gold', artifact: 'blue', creature: 'red', magic: 'muted', religion: 'green',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface LoreItem {
  id: string;
  origin: Origin;
  raw: LoreEntry;
}

export default function Lore() {
  const {
    lore, globalLore, linkedLoreIds,
    upsertLore, deleteLore, linkLoreToCampaign, unlinkLoreFromCampaign,
  } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const all = useMemo<LoreItem[]>(() => {
    const linked = new Set(linkedLoreIds);
    return lore
      .map(l => ({ id: l.id, origin: (linked.has(l.id) ? 'imported' : 'local') as Origin, raw: l }))
      .filter(item => {
        if (!search) return true;
        const q = search.toLowerCase();
        return item.raw.title.toLowerCase().includes(q) || (item.raw.category ?? '').toLowerCase().includes(q);
      });
  }, [lore, linkedLoreIds, search]);

  const imported = all.filter(i => i.origin === 'imported');
  const local = all.filter(i => i.origin === 'local');
  const selected = all.find(x => x.id === selectedId) || all[0] || null;

  const importPool = useMemo(() => {
    const linked = new Set(linkedLoreIds);
    return globalLore
      .filter(l => !linked.has(l.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [globalLore, linkedLoreIds]);

  const handleSelect = (item: LoreItem) => {
    setSelectedId(item.id);
    pushRecent({ kind: 'lore', id: item.id, label: item.raw.title, tab: 'lore' });
  };

  const handleAdd = async () => {
    const result = await upsertLore({ title: '', category: null, content: null, dm_only: false, world_id: null });
    if (result) setSelectedId(result.id);
  };

  const importEntry = async (entry: LoreEntry) => {
    await linkLoreToCampaign(entry.id);
    setSelectedId(entry.id);
    setShowImport(false);
  };

  const publish = async (entry: LoreEntry) => {
    await upsertLore({
      id: entry.id, title: entry.title, category: entry.category, content: entry.content,
      dm_only: entry.dm_only, world_id: activeWorldId || entry.world_id || null,
    }, 'global');
    await linkLoreToCampaign(entry.id);
  };

  const openInCanon = (id: string) => {
    setWorldTab('lore');
    setWorldSelected('lore', id);
    backToWorld();
  };

  const renderRow = (item: LoreItem) => (
    <ListRowWithHover key={item.id} entity={item.raw} kind="lore">
      <ListRow
        active={selected?.id === item.id}
        onClick={() => handleSelect(item)}
        glyph={GLYPH}
        title={item.raw.title || 'Untitled Entry'}
        subtitle={item.raw.category ? cap(item.raw.category) : ''}
        meta={item.raw.dm_only ? 'DM only' : undefined}
        badges={
          <>
            <Badge color={item.origin === 'imported' ? 'gold' : 'orange'} size="xs">
              {item.origin === 'imported' ? 'imported' : 'only here'}
            </Badge>
            {item.raw.category && (
              <Badge color={categoryBadgeColor[item.raw.category] ?? 'muted'}>{cap(item.raw.category)}</Badge>
            )}
          </>
        }
      />
    </ListRowWithHover>
  );

  return (
    <ListDetail
      title="Lore"
      count={all.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={handleAdd}
      addLabel="+ Lore"
      onImport={() => setShowImport(v => !v)}
      importLabel={showImport ? '× Close import' : '+ Import from canon'}
      list={
        <>
          {showImport && (
            <div className="cm-importbrowse">
              <div className="cm-importbrowse-head">Import from canon · {importPool.length} available</div>
              {importPool.length === 0 ? (
                <div className="cm-importbrowse-empty">Nothing left to import — every canon entry is already on this table.</div>
              ) : (
                importPool.map(l => (
                  <button key={l.id} className="cm-importbrowse-row" onClick={() => importEntry(l)}>
                    <span className="cm-importbrowse-glyph">{GLYPH}</span>
                    <span className="cm-importbrowse-body">
                      <span className="cm-importbrowse-name">{l.title || 'Untitled'}</span>
                      <span className="cm-importbrowse-sub">{l.category ? cap(l.category) : 'Lore'}</span>
                    </span>
                    <span className="cm-importbrowse-cta">Import ↓</span>
                  </button>
                ))
              )}
            </div>
          )}

          {all.length === 0 ? (
            <div className="cm-empty is-inline">No lore yet — create one or import from canon</div>
          ) : (
            <>
              {imported.length > 0 && (
                <>
                  <div className="cm-md-grouplabel">Imported from canon · {imported.length}</div>
                  {imported.map(renderRow)}
                </>
              )}
              {local.length > 0 && (
                <>
                  <div className="cm-md-grouplabel is-local">Created for this table · {local.length}</div>
                  {local.map(renderRow)}
                </>
              )}
            </>
          )}
        </>
      }
      detail={
        selected ? (
          <LoreDetail
            key={selected.id}
            entry={selected.raw}
            origin={selected.origin}
            onOpenInCanon={() => openInCanon(selected.id)}
            onPublish={() => publish(selected.raw)}
            onDetach={async () => { await unlinkLoreFromCampaign(selected.id); setSelectedId(null); }}
            onDelete={async () => {
              const yes = await confirm('Delete this lore entry?', 'This cannot be undone.');
              if (yes) { await deleteLore(selected.id); setSelectedId(null); }
            }}
          />
        ) : (
          <EmptyDetail>Select an entry from the list</EmptyDetail>
        )
      }
    />
  );
}

interface LoreForm {
  title: string;
  category: string;
  dm_only: boolean;
  content: string;
}

function loreToForm(entry: LoreEntry): LoreForm {
  return {
    title: entry.title ?? '',
    category: entry.category ?? 'history',
    dm_only: entry.dm_only ?? false,
    content: entry.content ?? '',
  };
}

interface DetailProps {
  origin: Origin;
  onOpenInCanon: () => void;
  onPublish: () => void;
  onDetach: () => void;
  onDelete: () => void;
}

function LoreDetail({ entry, origin, onOpenInCanon, onPublish, onDetach, onDelete }: { entry: LoreEntry } & DetailProps) {
  const { upsertLore } = useCampaign();
  const [form, setForm] = useState<LoreForm>(() => loreToForm(entry));

  useEffect(() => { setForm(loreToForm(entry)); }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<LoreForm>({
    data: form,
    onSave: async (data) => {
      await upsertLore({
        id: entry.id,
        title: data.title || 'Untitled Entry',
        category: data.category || null,
        dm_only: data.dm_only,
        content: data.content || null,
        world_id: entry.world_id,
      }, origin === 'imported' ? 'global' : 'campaign');
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof LoreForm>(key: K, value: LoreForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <DetailPanel eyebrow="Lore" title="">
      <OriginBand origin={origin} noun="lore entry" onOpenInCanon={onOpenInCanon} onPublish={onPublish} onDetach={onDetach} />

      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete entry', danger: true, onClick: onDelete }]} />
      </div>

      <input className="as-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Entry title…" />

      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Category</span>
          <select className="as-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {LORE_CATEGORIES.map(c => <option key={c} value={c}>{cap(c)}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">DM Only</span>
          <div className="as-pills">
            <button type="button" className={`as-pill-opt${form.dm_only ? ' is-active' : ''}`} onClick={() => set('dm_only', !form.dm_only)}>
              {form.dm_only ? 'Hidden from players' : 'Visible to players'}
            </button>
          </div>
        </div>
      </div>

      <DetailSection title="Content">
        <AutosaveTextarea value={form.content} onChange={v => set('content', v)} placeholder="Lore content…" rows={8} />
      </DetailSection>
    </DetailPanel>
  );
}
