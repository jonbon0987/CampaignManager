// Mock endpoint for testing the document import UI without hitting the real API.
// Returns a realistic SSE sequence: summary text → 4 passes → actions → done.
//
// Usage: temporarily change the fetch URL in submitDocument to '/api/parse-document-mock'
// or set VITE_MOCK_PARSE=true in .env.local (if you wire that up).

import type { VercelRequest, VercelResponse } from '@vercel/node';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function send(obj: unknown) {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  const body = req.body as { scope?: string; deriveTitle?: boolean };
  const scope = body?.scope === 'world' ? 'world' : 'campaign';

  // 1. Stream a summary sentence word by word
  const summaryWords = scope === 'world'
    ? ['Parsed', 'the', 'setting', 'document.', 'Found', '1', 'NPC,', '1', 'location,', '1',
       'lore', 'entry,', 'and', '1', 'timeline', 'event.', 'Extracting', 'changes', 'now...']
    : ['Parsed', 'the', 'campaign', 'document.', 'Found', '2', 'NPCs,', '1', 'location,',
       '1', 'faction,', '1', 'session,', 'and', '1', 'plot', 'hook.', 'Extracting', 'changes', 'now...'];
  for (const word of summaryWords) {
    send({ type: 'text', text: word + ' ' });
    await sleep(60);
  }

  if (body?.deriveTitle) {
    await sleep(150);
    if (scope === 'world') {
      send({ type: 'title', name: 'The Drowned Archive', tagline: 'A flooded library keeps every secret it has ever swallowed.' });
    } else {
      // For campaign scope the `tagline` field carries the premise.
      send({ type: 'title', name: 'The Silence Beneath', tagline: 'The party is hired to recover a book from the Drowned Library before the Archivist finishes reading it aloud — and the First Silence returns.' });
    }
  }

  // 2. Signal extraction start
  send({ type: 'extracting' });
  await sleep(300);

  // 3a. World-scope passes — only world-writable types (NPCs, Locations, Lore, Timeline)
  const worldPasses = [
    {
      label: 'characters',
      actions: [
        {
          type: 'upsertNPC',
          matched_id: null,
          reasoning: 'New world NPC: the archivist Sethri Vael, keeper of the drowned library.',
          payload: {
            name: 'Sethri Vael',
            role: 'Archivist',
            description: 'Keeper of the drowned library beneath Duskward; speaks only in questions.',
            status: 'active',
          },
        },
      ],
    },
    {
      label: 'locations',
      actions: [
        {
          type: 'upsertLocation',
          matched_id: null,
          reasoning: 'New location described in the document: the Drowned Library.',
          payload: {
            name: 'The Drowned Library',
            location_type: 'landmark',
            description: 'A flooded archive whose shelves are read by wading between them.',
          },
        },
      ],
    },
    {
      label: 'lore',
      actions: [
        {
          type: 'upsertLore',
          matched_id: null,
          reasoning: 'New lore: the myth of the First Silence.',
          payload: {
            title: 'The First Silence',
            category: 'history',
            content: 'The age when the gods first stopped answering, and mortals learned to keep records.',
          },
        },
      ],
    },
    {
      label: 'timeline events',
      actions: [
        {
          type: 'upsertTimelineEvent',
          matched_id: null,
          reasoning: 'Dated event anchoring the founding of the archive.',
          payload: {
            title: 'The Archive Is Founded',
            year: 412,
            display_date: 'CR 412',
            event_type: 'founding',
            era: 'First Silence',
            description: 'Sethri Vael begins the collection that will become the Drowned Library.',
          },
        },
      ],
    },
  ];

  // 3b. Campaign passes with actions
  const campaignPasses = [
    {
      label: 'characters',
      actions: [
        {
          type: 'upsertNPC',
          matched_id: null,
          reasoning: 'New NPC introduced in the document: a shady merchant named Aldric Voss.',
          payload: {
            name: 'Aldric Voss',
            role: 'Merchant',
            description: 'A shady merchant who deals in stolen goods from the old empire.',
            status: 'alive',
          },
        },
        {
          type: 'upsertNPC',
          matched_id: null,
          reasoning: 'New NPC: the innkeeper Marta, mentioned as a reliable contact.',
          payload: {
            name: 'Marta',
            role: 'Innkeeper',
            description: 'The innkeeper of the Rusty Flagon, a trusted contact for the party.',
            status: 'alive',
          },
        },
      ],
    },
    {
      label: 'locations & factions',
      actions: [
        {
          type: 'upsertLocation',
          matched_id: null,
          reasoning: 'New location described in the document: the Rusty Flagon tavern.',
          payload: {
            name: 'The Rusty Flagon',
            description: 'A dimly lit tavern on the edge of the merchant district, known for cheap ale and loose lips.',
            type: 'building',
          },
        },
        {
          type: 'upsertFaction',
          matched_id: null,
          reasoning: 'New faction introduced: the Grey Wardens smuggling ring.',
          payload: {
            name: 'The Grey Wardens',
            description: 'A smuggling ring operating under the guise of a merchant guild.',
            alignment: 'chaotic neutral',
          },
        },
      ],
    },
    {
      label: 'sessions, hooks & lore',
      actions: [
        {
          type: 'upsertSession',
          matched_id: null,
          reasoning: 'Session recap found in the document for session 4.',
          payload: {
            session_number: 4,
            title: 'The Merchant\'s Secret',
            summary: 'The party discovered that Aldric Voss is connected to the Grey Wardens smuggling ring.',
            date_played: '2026-04-10',
          },
        },
        {
          type: 'upsertHook',
          matched_id: null,
          reasoning: 'New plot hook: the party has a lead on the Grey Wardens\' warehouse.',
          payload: {
            title: 'The Grey Wardens\' Warehouse',
            description: 'Aldric let slip that the Grey Wardens store their contraband in a warehouse near the docks.',
            status: 'active',
          },
        },
      ],
    },
    {
      label: 'modules & scenes',
      actions: [],  // nothing in this pass — tests empty-pass handling
    },
  ];

  const passes = scope === 'world' ? worldPasses : campaignPasses;

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    send({ type: 'pass', index: i, total: passes.length, label: pass.label });
    await sleep(500);

    for (const action of pass.actions) {
      send({ type: 'action', action });
      await sleep(200);
    }
  }

  // 4. Done
  send({ type: 'done' });
  res.end();
}
