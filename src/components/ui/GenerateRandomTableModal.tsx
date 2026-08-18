// AI-driven whole random-table generator, shared by the campaign RandomEncounters
// tab and the world-level Combat view. Produces a full weighted table of a chosen
// kind (encounter / treasure / magic / wild / custom); for encounter tables it
// links generated creatures to the bestiary by name. Scope-specific data is
// injected via `deps`, mirroring GenerateEncounterModal.

import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildSelectedContextBlock, buildDefaultCampaignContextBlock } from '../../lib/campaignContext';
import {
  EntityContextPicker,
  useSelectedContextEntities,
  type ContextRef,
} from './EntityContextPicker';
import { RANDOM_TABLE_KINDS, DIE_SIZES, kindMeta } from '../../lib/randomEncounter';
import { buildTablePrompt, parseGeneratedTable } from '../../lib/randomTableGeneration';
import type { RandomEncounterSaveData } from './RandomEncounterDetail';
import type { RandomEncounterTable, MonsterStatblock } from '../../lib/database.types';

type ContextEntities = ReturnType<typeof useSelectedContextEntities>;

export interface TableGenDeps {
  createTable: (data: RandomEncounterSaveData) => Promise<RandomEncounterTable>;
  bestiary: MonsterStatblock[];
  tableCount: number;
  buildContext: (entities: ContextEntities) => string;
  contextLabel: string;
  contextHint: string;
}

// ── Scope wrappers ─────────────────────────────────────────────────────────

export function GenerateRandomTableModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (t: RandomEncounterTable) => void;
  defaultKind?: string;
}) {
  const {
    randomEncounterTables, upsertRandomEncounterTable, monsterStatblocks,
    overview, sessions, hooks, locations,
  } = useCampaign();

  const deps: TableGenDeps = {
    createTable: (data) => upsertRandomEncounterTable({ ...data, world_id: null }),
    bestiary: monsterStatblocks,
    tableCount: randomEncounterTables.length,
    buildContext: (entities) => entities.length > 0
      ? buildSelectedContextBlock(entities, { title: overview.title, plotSummary: overview.plotSummary })
      : buildDefaultCampaignContextBlock({
          overview: { title: overview.title, plotSummary: overview.plotSummary },
          sessions, hooks, locations,
        }),
    contextLabel: 'Campaign Context',
    contextHint: 'Add specific NPCs, threads, locations, factions, or lore to focus the table.',
  };

  return <RandomTableGenModal {...props} deps={deps} />;
}

export function GenerateWorldRandomTableModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (t: RandomEncounterTable) => void;
  defaultKind?: string;
}) {
  const { worldStatblocks, upsertWorldRandomEncounterTable, worldRandomEncounterTables, activeWorld } = useWorld();

  const deps: TableGenDeps = {
    createTable: (data) => upsertWorldRandomEncounterTable(data),
    bestiary: worldStatblocks,
    tableCount: worldRandomEncounterTables.length,
    buildContext: (entities) => buildSelectedContextBlock(entities, {
      title: activeWorld?.name ?? '',
      plotSummary: activeWorld?.tagline ?? '',
    }),
    contextLabel: 'World Context',
    contextHint: 'Add specific NPCs, factions, locations, or lore so the table feels native to your world.',
  };

  return <RandomTableGenModal {...props} deps={deps} />;
}

// ── Shared modal ───────────────────────────────────────────────────────────

function RandomTableGenModal({
  isOpen,
  onClose,
  onCreated,
  defaultKind = 'encounter',
  deps,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (t: RandomEncounterTable) => void;
  defaultKind?: string;
  deps: TableGenDeps;
}) {
  const { createTable, bestiary, tableCount, buildContext, contextLabel, contextHint } = deps;

  const [kind, setKind] = useState(defaultKind);
  const [die, setDie] = useState(100);
  const [region, setRegion] = useState('');
  const [theme, setTheme] = useState('');
  const [count, setCount] = useState('8');

  // A weighted table can't have more entries than the die has faces (each entry
  // needs at least one face), and we cap authoring at 20 for token/UX reasons.
  const maxEntries = Math.min(20, die);
  const [selectedContext, setSelectedContext] = useState<ContextRef[]>([]);
  const [additional, setAdditional] = useState('');
  const contextEntities = useSelectedContextEntities(selectedContext);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const bestiaryByName = useMemo(
    () => new Map(bestiary.map(s => [s.name.toLowerCase().trim(), s.id])),
    [bestiary],
  );

  const reset = () => {
    setKind(defaultKind); setDie(100); setRegion(''); setTheme(''); setCount('8');
    setSelectedContext([]); setAdditional(''); setError('');
  };
  const close = () => { if (loading) return; reset(); onClose(); };

  // Changing the die tightens the entry cap — clamp the current count into range.
  const changeDie = (d: number) => {
    setDie(d);
    const max = Math.min(20, d);
    const n = parseInt(count.trim(), 10);
    if (!isNaN(n) && n > max) setCount(String(max));
    setError('');
  };

  const handleGenerate = async () => {
    const n = parseInt(count.trim(), 10);
    if (isNaN(n) || n < 3 || n > maxEntries) {
      setError(`Number of entries must be between 3 and ${maxEntries} for a d${die}.`);
      return;
    }

    const prompt = buildTablePrompt({
      kind, die, region, theme, count: n,
      contextBlock: buildContext(contextEntities),
      additional,
      bestiaryNames: bestiary.map(s => s.name),
    });

    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/generate-encounter', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const parsed = parseGeneratedTable(kind, data.text ?? '', bestiaryByName);
      const label = kindMeta(kind).label;
      const table = await createTable({
        kind,
        name: parsed.name || `${label} Table`,
        subtitle: parsed.subtitle ?? null,
        environment: region.trim() || null,
        die_size: die,
        description: null,
        entries: JSON.stringify(parsed.entries),
        dm_notes: null,
        sort_order: tableCount,
      });

      reset();
      onCreated(table);
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Generate Random Table"
      onSave={loading ? undefined : handleGenerate}
      saveLabel="Generate"
      wide
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
          The DM Assistant will author a full weighted table you can roll on immediately.
        </p>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Kind">
            <select value={kind} onChange={e => setKind(e.target.value)} style={inputStyle} disabled={loading}>
              {RANDOM_TABLE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </FormField>
          <FormField label="Die">
            <select value={die} onChange={e => changeDie(parseInt(e.target.value, 10))} style={inputStyle} disabled={loading}>
              {DIE_SIZES.map(d => <option key={d} value={d}>d{d}</option>)}
            </select>
          </FormField>
          <FormField label="Number of Entries">
            <input type="number" min={3} max={maxEntries} value={count}
              onChange={e => { setCount(e.target.value); setError(''); }}
              placeholder="e.g. 8" style={inputStyle} disabled={loading} />
          </FormField>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-3)', marginTop: '-8px' }}>
          Weighted d{die} table · up to {maxEntries} {maxEntries === 1 ? 'entry' : 'entries'}.
        </p>

        <FormField label="Region (optional)">
          <input type="text" value={region} onChange={e => setRegion(e.target.value)}
            placeholder="e.g. Frostpeak Road, the Underdark" style={inputStyle} disabled={loading} />
        </FormField>

        <FormField label="Theme / Concept (optional)">
          <input type="text" value={theme} onChange={e => setTheme(e.target.value)}
            placeholder="e.g. wolves and worse in deep winter, a cursed hoard" style={inputStyle} disabled={loading} />
        </FormField>

        <div>
          <EntityContextPicker
            selected={selectedContext}
            onChange={setSelectedContext}
            disabled={loading}
            label={contextLabel}
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>{contextHint}</p>
        </div>

        <FormField label="Additional Instructions (optional)">
          <textarea rows={3} value={additional} onChange={e => setAdditional(e.target.value)}
            placeholder="e.g. keep it non-combat, lean spooky, include a rival adventuring party"
            style={textareaStyle} disabled={loading} />
        </FormField>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {loading && (
          <p className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
            Authoring the table…
          </p>
        )}
      </div>
    </Modal>
  );
}
