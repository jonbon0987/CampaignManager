import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Tab } from '../App';
import type { EntityType } from '../components/ui/StatBlockText';

/** Maps entity types to their corresponding sidebar tabs */
const ENTITY_TAB_MAP: Record<EntityType, Tab> = {
  creature: 'creatures',
  npc: 'characters',
  location: 'lore',
  session: 'sessions',
  faction: 'factions',
  hook: 'hooks',
};

interface NavigationContextValue {
  /** Navigate to a specific entity's tab and highlight it */
  navigateToEntity: (entityType: EntityType, id: string) => void;
  /** Currently highlighted entity id (if any) */
  highlightedEntityId: string | null;
  /** Clear the highlight */
  clearHighlight: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
  setActiveTab: (tab: Tab) => void;
}

export function NavigationProvider({ children, setActiveTab }: NavigationProviderProps) {
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
    setActiveTab(tab);
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
  }, [setActiveTab, timer]);

  return (
    <NavigationContext.Provider value={{ navigateToEntity, highlightedEntityId, clearHighlight }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
