// "✦ Generate" on the Items page: the assistant makes up one item from a kind,
// a rarity and the DM's idea, woven into whatever campaign context the DM
// picks. The item is saved straight away and opened, like a new stat sheet;
// it's the DM's to change from then on.

import { useState } from 'react';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { EntityContextPicker, useSelectedContextEntities, type ContextRef } from '../ui/EntityContextPicker';
import { useCampaign } from '../../context/CampaignContext';
import { useItems } from '../../context/items';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildSelectedContextBlock } from '../../lib/campaignContext';
import { ITEM_TYPES, RARITIES } from '../../lib/items';
import { buildItemPrompt, parseGeneratedItem, type RarityChoice } from '../../lib/itemGeneration';
import type { Item } from '../../lib/database.types';

export function GenerateItemModal({ isOpen, onClose, onCreated }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (item: Item) => void;
}) {
  const ctx = useItems();
  const { overview, selectedCampaign } = useCampaign();
  const [type, setType] = useState('any');
  const [rarityChoice, setRarityChoice] = useState<RarityChoice>('any');
  const [idea, setIdea] = useState('');
  const [context, setContext] = useState<ContextRef[]>([]);
  const contextEntities = useSelectedContextEntities(context);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setType('any'); setRarityChoice('any'); setIdea(''); setContext([]); setError(''); };
  const close = () => { if (loading) return; reset(); onClose(); };

  const generate = async () => {
    if (!ctx) return;
    setError('');
    setLoading(true);
    const asked = { type, rarity: rarityChoice };
    try {
      const prompt = buildItemPrompt({
        ...asked,
        idea,
        edition: selectedCampaign?.rules_edition ?? '2014',
        context: buildSelectedContextBlock(contextEntities, { title: overview.title, plotSummary: overview.plotSummary }),
        existingNames: ctx.items.map(i => i.name),
      });
      const res = await fetch('/api/generate-item', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json().catch(() => ({})) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);
      const item = await ctx.saveItem(parseGeneratedItem(data.text ?? '', asked));
      reset();
      onCreated(item);
    } catch (err) {
      setError(`Couldn’t make the item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Generate an item" onSave={loading ? undefined : () => void generate()} saveLabel="Generate">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
          The assistant makes up an item with its rules text and DM notes, and adds it to your items. Leave anything on “Any” to let it choose.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Kind">
            <select aria-label="Kind" value={type} onChange={e => setType(e.target.value)} style={inputStyle} disabled={loading}>
              <option value="any">Any kind</option>
              {ITEM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </FormField>
          <FormField label="Rarity">
            <select aria-label="Rarity" value={rarityChoice} onChange={e => setRarityChoice(e.target.value as RarityChoice)} style={inputStyle} disabled={loading}>
              <option value="any">Any rarity</option>
              <option value="none">Not magic</option>
              {RARITIES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="What do you have in mind? (optional)">
          <textarea
            aria-label="What you have in mind"
            rows={3}
            value={idea}
            onChange={e => setIdea(e.target.value)}
            placeholder="e.g. a dagger the Grey Hand’s assassins carry, or the reward for saving the harbourmaster"
            style={textareaStyle}
            disabled={loading}
          />
        </FormField>

        <div>
          <EntityContextPicker selected={context} onChange={setContext} disabled={loading} />
          <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
            Add NPCs, threads, places, factions or lore so the item belongs in your campaign.
          </p>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {loading && <p className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>Making the item…</p>}
      </div>
    </Modal>
  );
}
