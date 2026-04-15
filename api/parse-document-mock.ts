// Mock endpoint for testing the document import UI without hitting the real API.
// Returns a realistic SSE sequence: summary text → 4 passes → actions → done.
//
// Usage: temporarily change the fetch URL in submitDocument to '/api/parse-document-mock'
// or set VITE_MOCK_PARSE=true in .env.local (if you wire that up).

import type { VercelRequest, VercelResponse } from '@vercel/node';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function send(obj: unknown) {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  // 1. Stream a summary sentence word by word
  const summaryWords = [
    'Parsed', 'the', 'campaign', 'document.', 'Found', '2', 'NPCs,', '1', 'location,',
    '1', 'faction,', '1', 'session,', 'and', '1', 'plot', 'hook.', 'Extracting', 'changes', 'now...',
  ];
  for (const word of summaryWords) {
    send({ type: 'text', text: word + ' ' });
    await sleep(60);
  }

  // 2. Signal extraction start
  send({ type: 'extracting' });
  await sleep(300);

  // 3. Four passes with actions
  const passes = [
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
