import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Tab } from '../App';
import type { EntityType } from '../components/ui/StatBlockText';

/** Maps entity types to their corresponding sidebar tabs */
const ENTITY_TAB_MAP: Record<EntityType, Tab> = {
  statblock: 'combat',
  npc: 'cast',
  pc: 'cast',
  faction: 'cast',
  location: 'locations',
  lore: 'lore',
  module: 'modules',
  session: 'sessions',
  hook: 'threads',
};

interface NavigationContextValue {
  /** Navigate to a specific entity's tab and highlight it */
  navigateToEntity: (entityType: EntityType, id: string) => void;
  /** Currently highlighted entity id (if any) */
  highlightedEntityId: string | null;
  /** Clear the highlight */
  clearHighlight: () => void;
  /** Tells the shell which record a tab is showing, so the URL can name it. */
  reportRecord?: (tab: Tab, id: string | null) => void;
  /** Switches to a tab and opens a record there. Falls back to just the tab. */
  openRecord: (tab: Tab, id: string, kind?: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
  setActiveTab: (tab: Tab) => void;
  /** Switches to a tab and selects a record there (for tabs that take an open target). */
  openRecord?: (tab: Tab, id: string, kind?: string) => void;
  reportRecord?: (tab: Tab, id: string | null) => void;
}

export function NavigationProvider({ children, setActiveTab, openRecord, reportRecord }: NavigationProviderProps) {
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const clearHighlight = useCallback(() => {
    setHighlightedEntityId(null);
    if (timer) clearTimeout(timer);
  }, [timer]);

  const navigateToEntity = useCallback((entityType: EntityType, id: string) => {
    // Clear any existing highlight
    if (timer) clearTimeout(timer);

    const tab = ENTITY_TAB_MAP[entityType];
    if (openRecord) openRecord(tab, id, entityType);
    else setActiveTab(tab);
    setHighlightedEntityId(id);

    // Scroll to the element after the tab renders
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.querySelector(`[data-entity-id="${id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });

    // Auto-clear highlight after 3 seconds
    const t = setTimeout(() => {
      setHighlightedEntityId(null);
    }, 3000);
    setTimer(t);
  }, [setActiveTab, openRecord, timer]);

  const open = useCallback((tab: Tab, id: string, kind?: string) => {
    if (openRecord) openRecord(tab, id, kind);
    else setActiveTab(tab);
  }, [openRecord, setActiveTab]);

  return (
    <NavigationContext.Provider value={{ navigateToEntity, highlightedEntityId, clearHighlight, reportRecord, openRecord: open }}>
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * Puts the record a tab is showing into the URL. Pass the record the DM picked
 * (null for none). Outside the campaign shell, such as in tests, it does nothing.
 */
export function useReportRecord(tab: Tab, id: string | null | undefined) {
  const report = useContext(NavigationContext)?.reportRecord;
  useEffect(() => { report?.(tab, id ?? null); }, [report, tab, id]);
}

const noOpen = () => {};

/** Opens a record in its tab. Outside the campaign shell, such as in tests, it does nothing. */
// eslint-disable-next-line react-refresh/only-export-components -- a hook kept beside its provider
export function useOpenRecord(): (tab: Tab, id: string, kind?: string) => void {
  return useContext(NavigationContext)?.openRecord ?? noOpen;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
