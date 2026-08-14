import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./apiClient', () => ({ authHeaders: vi.fn().mockResolvedValue({}) }));
vi.mock('./aiProvider', () => ({ getAIProvider: vi.fn(() => 'anthropic') }));

import { generateCampaignDraft } from './generateCampaign';
import { sseChunks } from '../test/sse';

const mockFetch = (resp: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp));
afterEach(() => vi.unstubAllGlobals());

describe('generateCampaignDraft', () => {
  it('normalizes name/premise/party and filters title-less hooks', async () => {
    mockFetch(sseChunks(JSON.stringify({
      name: 'The Gathering Storm',
      premise: '  war brews on the border  ',
      party: '  four level-3 heroes  ',
      hooks: [
        { title: 'The Shard', category: 'main_plot', description: 'find it' },
        { category: 'side_quest' }, // no title → dropped
        { title: 'B' }, { title: 'C' }, { title: 'D' },
      ],
    })));

    const draft = await generateCampaignDraft('idea');
    expect(draft.name).toBe('The Gathering Storm');
    expect(draft.premise).toBe('war brews on the border');
    expect(draft.party).toBe('four level-3 heroes');
    expect(draft.hooks).toEqual([
      { title: 'The Shard', category: 'main_plot', description: 'find it' },
      { title: 'B', category: null, description: null },
      { title: 'C', category: null, description: null },
      { title: 'D', category: null, description: null },
    ]);
    // 4 hooks → plural + 3-item cap + ellipsis
    expect(draft.summaryLines).toEqual([
      { glyph: '❧', text: '4 starter threads — The Shard, B, C…' },
    ]);
  });

  it('uses the singular "thread" for exactly one hook', async () => {
    mockFetch(sseChunks(JSON.stringify({ name: 'Solo', hooks: [{ title: 'Only One' }] })));
    const draft = await generateCampaignDraft('idea');
    expect(draft.summaryLines).toEqual([{ glyph: '❧', text: '1 starter thread — Only One' }]);
  });

  it('emits no summary line when there are no hooks', async () => {
    mockFetch(sseChunks(JSON.stringify({ name: 'Bare', premise: 'p' })));
    const draft = await generateCampaignDraft('idea');
    expect(draft.hooks).toEqual([]);
    expect(draft.summaryLines).toEqual([]);
    expect(draft.party).toBe(''); // missing → empty string
  });

  it('throws when the draft has no name', async () => {
    mockFetch(sseChunks(JSON.stringify({ premise: 'nameless' })));
    await expect(generateCampaignDraft('idea')).rejects.toThrow(/did not return a campaign name/);
  });
});
