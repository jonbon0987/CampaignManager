/* ════════════════════════════════════════════════════════════════
   EntityRefContext — mode-agnostic source of truth for inline entity
   references used by SlashField, the read renderer, and EntityChip.

   The base provider is "dumb": it just holds an entity index plus
   detail/open callbacks. Two builder providers feed it data from the
   contexts available in each shell:
     - CampaignEntityRefProvider (campaign mode: campaign + nav + panel)
     - WorldEntityRefProvider    (world mode: world entities)
   This keeps the editor working in BOTH modes without conditional hooks.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useCampaign } from './CampaignContext';
import { useNavigation } from './NavigationContext';
import { useStatBlockPanel } from './StatBlockPanelContext';
import { useWorld } from './WorldContext';
import {
  KIND_GLYPH, KIND_LABEL, mdToPlain,
} from '../lib/slashMarkdown';
import type { RefKind } from '../lib/slashMarkdown';

export interface EntityRef {
  id: string;
  kind: RefKind;
  label: string;
  sub?: string;
}

export interface EntityDetail {
  label: string;
  sub: string;
  desc: string;
  meta: string[];
}

interface EntityRefValue {
  entities: EntityRef[];
  refById: (kind: RefKind, id: string) => EntityRef | undefined;
  detailFor: (kind: RefKind, id: string) => EntityDetail;
  openRef: (kind: RefKind, id: string) => void;
  KIND_GLYPH: Record<RefKind, string>;
  KIND_LABEL: Record<RefKind, string>;
}

const EMPTY: EntityRefValue = {
  entities: [],
  refById: () => undefined,
  detailFor: (kind, id) => ({ label: id, sub: KIND_LABEL[kind] ?? '', desc: 'No description yet.', meta: [] }),
  openRef: () => {},
  KIND_GLYPH,
  KIND_LABEL,
};

const EntityRefContext = createContext<EntityRefValue>(EMPTY);

export function useEntityRefs(): EntityRefValue {
  return useContext(EntityRefContext);
}

/* ── base provider ── */
function EntityRefProvider({
  entities,
  detailMap,
  openRef,
  children,
}: {
  entities: EntityRef[];
  detailMap: Record<string, EntityDetail>;
  openRef: (kind: RefKind, id: string) => void;
  children: ReactNode;
}) {
  const value = useMemo<EntityRefValue>(() => {
    const byKey = new Map(entities.map(e => [`${e.kind}:${e.id}`, e]));
    return {
      entities,
      refById: (kind, id) => byKey.get(`${kind}:${id}`),
      detailFor: (kind, id) => detailMap[`${kind}:${id}`] ?? {
        label: byKey.get(`${kind}:${id}`)?.label ?? id,
        sub: KIND_LABEL[kind] ?? '',
        desc: 'No description yet.',
        meta: [],
      },
      openRef,
      KIND_GLYPH,
      KIND_LABEL,
    };
  }, [entities, detailMap, openRef]);

  return <EntityRefContext.Provider value={value}>{children}</EntityRefContext.Provider>;
}

/* ════════════════════════════════════════════════
   CAMPAIGN builder — campaign + linked-world entities
   ════════════════════════════════════════════════ */

export function CampaignEntityRefProvider({ children }: { children: ReactNode }) {
  const { npcs, pcs, factions, locations, lore, sessions, hooks, modules, monsterStatblocks } = useCampaign();
  const { navigateToEntity } = useNavigation();
  const { openStatBlock } = useStatBlockPanel();

  const { entities, detailMap } = useMemo(() => {
    const list: EntityRef[] = [];
    const detail: Record<string, EntityDetail> = {};
    const add = (kind: RefKind, id: string, label: string, sub: string, desc: string, meta: string[]) => {
      list.push({ id, kind, label, sub });
      detail[`${kind}:${id}`] = { label, sub, desc: mdToPlain(desc) || 'No description yet.', meta: meta.filter(Boolean) };
    };

    npcs.forEach(n => add('npc', n.id, n.name, n.role ?? '', n.description ?? '', [n.status ?? '', n.role ?? '']));
    pcs.forEach(p => add('pc', p.id, p.character_name, [p.race, p.class].filter(Boolean).join(' '), p.story_hooks ?? '', [p.player_name ? `Player ${p.player_name}` : '', [p.race, p.class].filter(Boolean).join(' ')]));
    factions.forEach(f => add('faction', f.id, f.name, f.faction_type ?? 'Faction', f.overview ?? '', [f.faction_type ?? '']));
    locations.forEach(l => add('location', l.id, l.name, l.location_type ?? 'Place', l.description ?? '', [l.location_type ?? '', l.region ?? '']));
    lore.forEach(e => add('lore', e.id, e.title, 'Lore', e.content ?? '', [e.category ?? '']));
    modules.forEach(m => add('module', m.id, m.title, m.chapter ? `Ch. ${m.chapter}` : 'Module', m.synopsis ?? '', [m.status ?? '']));
    sessions.forEach(s => add('session', s.id, `Session #${s.session_number}`, s.session_date ?? '', s.summary ?? '', [s.session_date ?? '']));
    hooks.forEach(h => add('hook', h.id, h.title, h.category ?? 'Hook', h.description ?? '', [h.category ?? '', h.is_active ? 'open' : 'resolved']));
    monsterStatblocks.forEach(m => add('statblock', m.id, m.name, m.challenge_rating ? `CR ${m.challenge_rating}` : 'Statblock', m.dm_notes ?? '', [m.creature_type ?? '', m.challenge_rating ? `CR ${m.challenge_rating}` : '']));

    return { entities: list, detailMap: detail };
  }, [npcs, pcs, factions, locations, lore, sessions, hooks, modules, monsterStatblocks]);

  const openRef = useMemo(() => (kind: RefKind, id: string) => {
    if (kind === 'statblock') openStatBlock(id);
    else navigateToEntity(kind, id);
  }, [navigateToEntity, openStatBlock]);

  return <EntityRefProvider entities={entities} detailMap={detailMap} openRef={openRef}>{children}</EntityRefProvider>;
}

/* ════════════════════════════════════════════════
   WORLD builder — world-scoped entities
   ════════════════════════════════════════════════ */

export function WorldEntityRefProvider({ children }: { children: ReactNode }) {
  const { npcs, factions, locations, lore, bestiary, encounters, setWorldTab, setSelected } = useWorld();

  const { entities, detailMap } = useMemo(() => {
    const list: EntityRef[] = [];
    const detail: Record<string, EntityDetail> = {};
    const add = (kind: RefKind, id: string, label: string, sub: string, desc: string, meta: string[]) => {
      list.push({ id, kind, label, sub });
      detail[`${kind}:${id}`] = { label, sub, desc: mdToPlain(desc) || 'No description yet.', meta: meta.filter(Boolean) };
    };

    npcs.forEach(n => add('npc', n.id, n.name, n.role, n.desc, [n.status, n.era]));
    factions.forEach(f => add('faction', f.id, f.name, f.type, f.desc, [f.type]));
    locations.forEach(l => add('location', l.id, l.name, l.type, l.desc, (l.tags ?? []).slice(0, 3)));
    lore.forEach(e => add('lore', e.id, e.title, 'Lore', e.desc, (e.tags ?? []).slice(0, 3)));
    bestiary.forEach(b => add('statblock', b.id, b.name, b.cr ? `CR ${b.cr}` : 'Statblock', b.desc, [b.type, b.cr ? `CR ${b.cr}` : '']));
    encounters.forEach(e => add('hook', e.id, e.name, e.difficulty, e.notes, [e.difficulty, e.status]));

    return { entities: list, detailMap: detail };
  }, [npcs, factions, locations, lore, bestiary, encounters]);

  const openRef = useMemo(() => (kind: RefKind, id: string) => {
    const tabMap: Partial<Record<RefKind, 'npcs' | 'locations' | 'lore' | 'combat'>> = {
      npc: 'npcs', faction: 'npcs', location: 'locations', lore: 'lore', statblock: 'combat',
    };
    const tab = tabMap[kind];
    if (tab) {
      setWorldTab(tab);
      setSelected(tab === 'npcs' ? 'npcs' : tab === 'locations' ? 'locations' : tab === 'lore' ? 'lore' : 'combat', id);
    }
  }, [setWorldTab, setSelected]);

  return <EntityRefProvider entities={entities} detailMap={detailMap} openRef={openRef}>{children}</EntityRefProvider>;
}
