// seed_relationships.ts
// -----------------------------------------------------------
// One-time seed script to insert all known character relationships
// for the Age of Wild Magic campaign into the character_relationships table.
//
// Requires the character_relationships table to already exist.
// Run AFTER the main seed.ts has populated player_characters and npcs.
//
// USAGE:
//   SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx src/lib/seed_relationships.ts
// -----------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, key);
const USER_ID = '6529dd61-6bca-4403-8a07-3bf8423f6d8d';

// ─── look up IDs by name ──────────────────────────────────────────────────────

async function getPCId(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('player_characters')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('character_name', name)
    .single();
  if (error || !data) throw new Error(`PC not found: ${name}`);
  return data.id;
}

async function getNPCId(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('npcs')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('name', name)
    .single();
  if (error || !data) throw new Error(`NPC not found: ${name}`);
  return data.id;
}

// ─── relationship row builder ─────────────────────────────────────────────────

type RelType = 'ally' | 'rival' | 'foe' | 'neutral';
type Kind = 'pc' | 'npc';

interface RelRow {
  user_id: string;
  from_id: string;
  from_kind: Kind;
  to_id: string;
  to_kind: Kind;
  relationship_type: RelType;
  label: string | null;
}

function rel(
  fromId: string, fromKind: Kind,
  toId: string,   toKind: Kind,
  type: RelType,
  label: string | null = null,
): RelRow {
  return { user_id: USER_ID, from_id: fromId, from_kind: fromKind, to_id: toId, to_kind: toKind, relationship_type: type, label };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── look up all IDs ──────────────────────────────────────────────────────────
  const [
    mara, kutter, mortecai, mittens, exius, craren,
  ] = await Promise.all([
    getPCId('Mara Lapideri'),
    getPCId('Kutter Cook'),
    getPCId('Mortecai Wastewalker'),
    getPCId('Mittens'),
    getPCId('Exius'),
    getPCId('Craren Wispmaw'),
  ]);

  const [
    gorg, torbo, lilith, darius, malachi, mingo,
    thresh, cob, garth, finn, madge, trashLurker,
    tuck, pip, salo, scratch, aldric,
  ] = await Promise.all([
    getNPCId('Gorg Grimfang'),
    getNPCId('Torbo'),
    getNPCId('Princess Lilith Kaldani'),
    getNPCId('Darius'),
    getNPCId('Malachi The Mage'),
    getNPCId('Mingo'),
    getNPCId('Thresh'),
    getNPCId('Cob Wrenwick'),
    getNPCId('Garth Two-Fingers'),
    getNPCId('Finn'),
    getNPCId('Madge'),
    getNPCId('The Trash Lurker'),
    getNPCId('Tuck'),
    getNPCId('Pip'),
    getNPCId('Salo'),
    getNPCId('Scratch Vellum'),
    getNPCId('Aldric Voss'),
  ]);

  const pcs: [string, string][] = [
    [mara,     'Mara Lapideri'],
    [kutter,   'Kutter Cook'],
    [mortecai, 'Mortecai Wastewalker'],
    [mittens,  'Mittens'],
    [exius,    'Exius'],
    [craren,   'Craren Wispmaw'],
  ];

  const rows: RelRow[] = [];

  // ── PC ↔ PC alliances (The New Renegades) ───────────────────────────────────
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      rows.push(rel(pcs[i][0], 'pc', pcs[j][0], 'pc', 'ally', 'The New Renegades'));
    }
  }

  // ── All PCs → Gorg (crew captain / ally) ────────────────────────────────────
  for (const [pcId] of pcs) {
    rows.push(rel(pcId, 'pc', gorg, 'npc', 'ally', 'The New Renegades'));
  }

  // ── All PCs → Torbo (first mate / ally) ─────────────────────────────────────
  for (const [pcId] of pcs) {
    rows.push(rel(pcId, 'pc', torbo, 'npc', 'ally', 'The New Renegades'));
  }

  // ── All PCs → Thresh (Gutted Eel home base — friendly neutral) ──────────────
  for (const [pcId] of pcs) {
    rows.push(rel(pcId, 'pc', thresh, 'npc', 'neutral', 'Home base at the Gutted Eel'));
  }

  // ── All PCs → Darius (true villain — foe) ───────────────────────────────────
  for (const [pcId] of pcs) {
    rows.push(rel(pcId, 'pc', darius, 'npc', 'foe', 'Ultimate antagonist'));
  }

  // ── Mara ────────────────────────────────────────────────────────────────────
  rows.push(rel(mara, 'pc', malachi, 'npc', 'foe',    'Cursed and memory-wiped her'));
  rows.push(rel(mara, 'pc', finn,    'npc', 'rival',  'Spotted him in Skarport; dropped a crystal in her bag'));
  rows.push(rel(mara, 'pc', lilith,  'npc', 'ally',   'Childhood friends at Ishvalenoran court'));

  // ── Kutter ──────────────────────────────────────────────────────────────────
  rows.push(rel(kutter, 'pc', finn,   'npc', 'rival',  'Recognizes his guild technique; suspects him of murder'));
  rows.push(rel(kutter, 'pc', aldric, 'npc', 'rival',  'List-adjacent; had a razor to his throat'));

  // ── Mortecai ─────────────────────────────────────────────────────────────────
  rows.push(rel(mortecai, 'pc', salo,       'npc', 'ally',   'Healed her; she cleansed the harbor'));
  rows.push(rel(mortecai, 'pc', trashLurker,'npc', 'ally',   'Partially reversed mutation; now friendly'));
  rows.push(rel(mortecai, 'pc', pip,        'npc', 'ally',   'Shared interest in wildstone contamination research'));

  // ── Mittens ──────────────────────────────────────────────────────────────────
  rows.push(rel(mittens, 'pc', tuck,       'npc', 'ally',   'Paid 20 gp for his fare; mirror of his past'));
  rows.push(rel(mittens, 'pc', scratch,    'npc', 'foe',    'Threatens Orwin\'s orphanage'));
  rows.push(rel(mittens, 'pc', trashLurker,'npc', 'neutral', 'Psychic link from ceremonial lick'));

  // ── Exius ────────────────────────────────────────────────────────────────────
  rows.push(rel(exius, 'pc', pip,    'npc', 'neutral', 'She monitors him; he knows but isn\'t hostile'));
  rows.push(rel(exius, 'pc', scratch,'npc', 'foe',    'Backed down his collector; now on Scratch\'s radar'));
  rows.push(rel(exius, 'pc', lilith, 'npc', 'neutral', 'Magical echo of Balderon; she\'s his bloodline counterpart'));

  // ── Craren ───────────────────────────────────────────────────────────────────
  rows.push(rel(craren, 'pc', garth, 'npc', 'neutral', 'Caught cheating; pragmatic pit-fight deal'));

  // ── NPC ↔ NPC ────────────────────────────────────────────────────────────────
  rows.push(rel(gorg,  'npc', mingo,       'npc', 'ally',   'Trusted fence contact'));
  rows.push(rel(gorg,  'npc', lilith,      'npc', 'ally',   'Growing paternal attachment'));
  rows.push(rel(gorg,  'npc', torbo,       'npc', 'ally',   'Captain and first mate'));

  rows.push(rel(darius, 'npc', malachi,   'npc', 'ally',   'Malachi serves Darius reluctantly'));
  rows.push(rel(darius, 'npc', lilith,    'npc', 'foe',    'Siphons her magic to power the Great Tree'));

  rows.push(rel(malachi, 'npc', lilith,   'npc', 'neutral', 'Knows the plan is evil; conflicted'));

  rows.push(rel(finn,    'npc', madge,    'npc', 'neutral', 'Used her back room as a base; she didn\'t ask questions'));
  rows.push(rel(finn,    'npc', cob,      'npc', 'rival',   'Cob\'s smuggling operation intersected the network'));

  rows.push(rel(trashLurker, 'npc', torbo,'npc', 'ally',   'Claims best friends forever (Torbo disagrees)'));
  rows.push(rel(tuck,        'npc', scratch,'npc','foe',    'Scratch Vellum shut down his flophouse'));

  rows.push(rel(pip, 'npc', lilith, 'npc', 'neutral', 'Lilith is Balderon\'s blood; Pip may deduce this'));

  // ── insert ───────────────────────────────────────────────────────────────────
  const { error } = await supabase.from('character_relationships').insert(rows);
  if (error) {
    console.error('❌  character_relationships:', error.message);
  } else {
    console.log(`✅  character_relationships: ${rows.length} row(s) inserted`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
