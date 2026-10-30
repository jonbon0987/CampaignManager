// What the ⌘K palette lists in each scope: records to open and actions to run.

import { useMemo } from 'react';
import type { Tab } from '../../App';
import type { WorldTab } from '../../types/world';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import type { PaletteItem } from './CommandPalette';

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ');

const CAMPAIGN_PLACES: { tab: Tab; label: string; glyph: string; view?: string }[] = [
  { tab: 'overview', label: 'Home', glyph: '❖' },
  { tab: 'sessions', label: 'Sessions', glyph: '❧' },
  { tab: 'sessions', label: 'Session prep', glyph: '❧', view: 'prep' },
  { tab: 'modules', label: 'Modules', glyph: '◇' },
  { tab: 'threads', label: 'Threads', glyph: '✧' },
  { tab: 'threads', label: 'Ideas inbox', glyph: '✎', view: 'inbox' },
  { tab: 'combat', label: 'Encounters', glyph: '⚔' },
  { tab: 'cast', label: 'Cast', glyph: '❦' },
  { tab: 'cast', label: 'Relationship web', glyph: '❦', view: 'web' },
  { tab: 'locations', label: 'Locations', glyph: '✦' },
  { tab: 'lore', label: 'Lore', glyph: '❡' },
  { tab: 'settings', label: 'Campaign settings', glyph: '⚙' },
];

export interface CampaignPaletteHandlers {
  openRecord: (tab: Tab, id: string, kind?: string) => void;
  openView: (tab: Tab, view?: string) => void;
  runMode: boolean;
  toggleRun: () => void;
  openSessionTools: () => void;
  openNote: () => void;
  openCapture: () => void;
  openShortcuts: () => void;
  backToWorld: () => void;
}

export function useCampaignPaletteItems(h: CampaignPaletteHandlers): PaletteItem[] {
  const c = useCampaign();
  const {
    sessions, sessionPreps, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks, encounters,
    upsertNPC, upsertPC, upsertFaction, upsertLocation, upsertLore, upsertSession,
  } = c;

  return useMemo(() => {
    // Makes a blank record, marks it a draft (left empty, it's removed) and opens it.
    const create = (tab: Tab, make: () => Promise<{ id: string } | undefined | null>) => async () => {
      const rec = await make();
      if (rec?.id) { markDraft(rec.id); h.openRecord(tab, rec.id); }
    };
    const nextSession = sessions.length ? Math.max(...sessions.map(s => s.session_number)) + 1 : 1;

    const actions: PaletteItem[] = [
      { key: 'a:run', group: 'Actions', glyph: h.runMode ? '■' : '▶', label: h.runMode ? 'End session' : 'Start session', action: true, run: h.toggleRun },
      { key: 'a:tools', group: 'Actions', glyph: '⚄', label: 'Session tools: initiative and dice', action: true, run: h.openSessionTools },
      { key: 'a:note', group: 'Actions', glyph: '✎', label: 'Quick note', detail: 'Saves to the Ideas inbox · ⌘.', action: true, run: h.openNote },
      { key: 'a:npc', group: 'Create', glyph: '❦', label: 'New NPC', action: true, run: create('cast', () => upsertNPC({ name: '', role: null, affiliation: null, status: 'active', description: null, hooks_motivations: null, dm_notes: null, location: null, first_session: null, met_by_pcs: false, faction_ids: [], statblock_id: null, world_id: null })) },
      { key: 'a:pc', group: 'Create', glyph: '❦', label: 'New player character', action: true, run: create('cast', () => upsertPC({ character_name: '', player_name: null, race: null, class: null, level: null, max_hp: null, armor_class: null, background: null, story_hooks: null, key_npcs: null, dm_notes: null, is_active: true, faction_ids: [], statblock_id: null })) },
      { key: 'a:faction', group: 'Create', glyph: '◈', label: 'New faction', action: true, run: create('cast', () => upsertFaction({ name: '', faction_type: 'other', overview: null, key_figures: null, agenda: null, dm_notes: null, world_id: null })) },
      { key: 'a:location', group: 'Create', glyph: '✦', label: 'New location', action: true, run: create('locations', () => upsertLocation({ name: '', location_type: 'landmark', region: null, parent_id: null, description: null, dm_notes: null, history: null, population: null, status: null, world_id: null })) },
      { key: 'a:lore', group: 'Create', glyph: '❡', label: 'New lore entry', action: true, run: create('lore', () => upsertLore({ title: '', category: null, content: null, dm_only: false, world_id: null })) },
      { key: 'a:session', group: 'Create', glyph: '❧', label: `New session (#${nextSession})`, action: true, run: async () => {
        const s = await upsertSession({ session_number: nextSession, session_date: new Date().toISOString().split('T')[0], summary: null, combats: null, loot_rewards: null, hooks_notes: null, dm_notes: null });
        if (s?.id) h.openRecord('sessions', s.id);
      } },
      { key: 'a:capture', group: 'Actions', glyph: '✍', label: 'Post-session quick capture', run: h.openCapture },
      { key: 'a:keys', group: 'Actions', glyph: '⌨', label: 'Keyboard shortcuts', run: h.openShortcuts },
      { key: 'a:world', group: 'Actions', glyph: '⊕', label: 'Back to the world', run: h.backToWorld },
      ...CAMPAIGN_PLACES.map(p => ({ key: `go:${p.tab}:${p.view ?? ''}`, group: 'Go to', glyph: p.glyph, label: p.label, run: () => h.openView(p.tab, p.view) })),
    ];

    const records: PaletteItem[] = [
      ...sessions.map(s => ({ key: `s:${s.id}`, group: 'Sessions', glyph: '❧', label: `Session #${s.session_number}`, detail: s.session_date ?? undefined,
        keywords: join(s.summary, s.combats, s.loot_rewards, s.hooks_notes, s.dm_notes), run: () => h.openRecord('sessions', s.id) })),
      ...sessionPreps.map(p => ({ key: `sp:${p.id}`, group: 'Session prep', glyph: '❧', label: `Session #${p.session_number} prep`, detail: p.prep_date ?? undefined,
        keywords: join(p.notes), run: () => h.openView('sessions', 'prep') })),
      ...pcs.map(p => ({ key: `pc:${p.id}`, group: 'Player characters', glyph: '❦', label: p.character_name || 'Unnamed character',
        detail: join(p.race, p.class, p.player_name ? `· ${p.player_name}` : null) || undefined, keywords: join(p.player_name, p.background, p.story_hooks), run: () => h.openRecord('cast', p.id) })),
      ...npcs.map(n => ({ key: `npc:${n.id}`, group: 'NPCs', glyph: '❦', label: n.name || 'Unnamed NPC',
        detail: [n.role, n.affiliation].filter(Boolean).join(' · ') || undefined, keywords: join(n.description, n.hooks_motivations, n.location), run: () => h.openRecord('cast', n.id) })),
      ...factions.map(f => ({ key: `f:${f.id}`, group: 'Factions', glyph: '◈', label: f.name || 'Unnamed faction', detail: f.faction_type ?? undefined,
        keywords: join(f.overview, f.key_figures, f.agenda), run: () => h.openRecord('cast', f.id) })),
      ...locations.map(l => ({ key: `l:${l.id}`, group: 'Locations', glyph: '✦', label: l.name || 'Unnamed location',
        detail: [l.location_type, l.region].filter(Boolean).join(' · ') || undefined, keywords: join(l.description, l.history), run: () => h.openRecord('locations', l.id) })),
      ...lore.map(e => ({ key: `lore:${e.id}`, group: 'Lore', glyph: '❡', label: e.title || 'Untitled entry', detail: e.category ?? undefined,
        keywords: join(e.content), run: () => h.openRecord('lore', e.id) })),
      ...hooks.map(t => ({ key: `t:${t.id}`, group: 'Threads', glyph: '✧', label: t.title, detail: t.state ?? (t.is_active ? 'active' : 'resolved'),
        keywords: join(t.description, t.category), run: () => h.openRecord('threads', t.id) })),
      ...modules.map(m => ({ key: `m:${m.id}`, group: 'Modules', glyph: '◇', label: m.title, detail: `Chapter ${m.chapter ?? '?'} · ${m.status}`,
        keywords: join(m.synopsis, m.dm_notes), run: () => h.openRecord('modules', m.id) })),
      ...monsterStatblocks.map(s => ({ key: `sb:${s.id}`, group: 'Stat sheets', glyph: '⚔', label: s.name,
        detail: [s.creature_type, s.challenge_rating ? `CR ${s.challenge_rating}` : null].filter(Boolean).join(' · ') || undefined, keywords: join(s.tags), run: () => h.openRecord('combat', s.id, 'statblock') })),
      ...encounters.map(e => ({ key: `e:${e.id}`, group: 'Encounters', glyph: '⚔', label: e.name, detail: e.status ?? undefined,
        keywords: join(e.description), run: () => h.openRecord('combat', e.id, 'encounter') })),
    ];
    return [...actions, ...records];
  }, [h, sessions, sessionPreps, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks, encounters,
      upsertNPC, upsertPC, upsertFaction, upsertLocation, upsertLore, upsertSession]);
}

const WORLD_PLACES: { tab: WorldTab; label: string; glyph: string }[] = [
  { tab: 'overview', label: 'World overview', glyph: '❖' },
  { tab: 'timeline', label: 'Timeline', glyph: '❂' },
  { tab: 'npcs', label: 'Cast', glyph: '❦' },
  { tab: 'locations', label: 'Locations', glyph: '✦' },
  { tab: 'lore', label: 'Lore', glyph: '❡' },
  { tab: 'combat', label: 'Encounters', glyph: '⚔' },
];

export function useWorldPaletteItems(h: { openShortcuts: () => void; openNewCampaign: () => void }): PaletteItem[] {
  const w = useWorld();
  const { npcs, factions, locations, lore, timeline, campaigns, setWorldTab, setSelected, openCampaign,
    createNPC, createFaction, createLocation, createLoreEntry } = w;

  return useMemo(() => {
    const open = (tab: WorldTab, id: string) => { setWorldTab(tab); setSelected(tab, id); };
    const create = (tab: WorldTab, make: () => Promise<string | null>) => async () => {
      const id = await make();
      if (id) { markDraft(id); open(tab, id); }
    };
    const actions: PaletteItem[] = [
      { key: 'a:npc', group: 'Create', glyph: '❦', label: 'New NPC in canon', action: true, run: create('npcs', createNPC) },
      { key: 'a:faction', group: 'Create', glyph: '◈', label: 'New faction in canon', action: true, run: create('npcs', createFaction) },
      { key: 'a:location', group: 'Create', glyph: '✦', label: 'New location in canon', action: true, run: create('locations', createLocation) },
      { key: 'a:lore', group: 'Create', glyph: '❡', label: 'New lore entry in canon', action: true, run: create('lore', createLoreEntry) },
      { key: 'a:campaign', group: 'Create', glyph: '❧', label: 'New campaign', action: true, run: h.openNewCampaign },
      { key: 'a:keys', group: 'Actions', glyph: '⌨', label: 'Keyboard shortcuts', run: h.openShortcuts },
      ...WORLD_PLACES.map(p => ({ key: `go:${p.tab}`, group: 'Go to', glyph: p.glyph, label: p.label, run: () => setWorldTab(p.tab) })),
    ];
    const records: PaletteItem[] = [
      ...campaigns.map(c => ({ key: `c:${c.id}`, group: 'Campaigns', glyph: '❧', label: c.name, detail: c.status, run: () => openCampaign(c.id) })),
      ...npcs.map(n => ({ key: `npc:${n.id}`, group: 'NPCs', glyph: '❦', label: n.name || 'Unnamed NPC', detail: n.role || undefined, keywords: n.desc, run: () => open('npcs', n.id) })),
      ...factions.map(f => ({ key: `f:${f.id}`, group: 'Factions', glyph: '◈', label: f.name || 'Unnamed faction', detail: f.type || undefined, keywords: f.desc, run: () => open('npcs', f.id) })),
      ...locations.map(l => ({ key: `l:${l.id}`, group: 'Locations', glyph: '✦', label: l.name || 'Unnamed location', detail: l.type || undefined, keywords: join(l.desc, l.region, l.history), run: () => open('locations', l.id) })),
      ...lore.map(e => ({ key: `lore:${e.id}`, group: 'Lore', glyph: '❡', label: e.title || 'Untitled entry', keywords: e.desc, run: () => open('lore', e.id) })),
      ...timeline.map(t => ({ key: `tl:${t.id}`, group: 'Timeline', glyph: '❂', label: t.title, detail: t.date || undefined, keywords: t.desc, run: () => setWorldTab('timeline') })),
    ];
    return [...actions, ...records];
  }, [h, npcs, factions, locations, lore, timeline, campaigns, setWorldTab, setSelected, openCampaign,
      createNPC, createFaction, createLocation, createLoreEntry]);
}
