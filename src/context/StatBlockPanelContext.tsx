import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface StatBlockPanelContextValue {
  activeStatBlockId: string | null;
  openStatBlock: (id: string) => void;
  closeStatBlock: () => void;
}

const StatBlockPanelContext = createContext<StatBlockPanelContextValue | null>(null);

export function StatBlockPanelProvider({ children }: { children: ReactNode }) {
  const [activeStatBlockId, setActiveStatBlockId] = useState<string | null>(null);

  return (
    <StatBlockPanelContext.Provider
      value={{
        activeStatBlockId,
        openStatBlock: (id) => setActiveStatBlockId(id),
        closeStatBlock: () => setActiveStatBlockId(null),
      }}
    >
      {children}
    </StatBlockPanelContext.Provider>
  );
}

export function useStatBlockPanel(): StatBlockPanelContextValue {
  const ctx = useContext(StatBlockPanelContext);
  if (!ctx) throw new Error('useStatBlockPanel must be used within StatBlockPanelProvider');
  return ctx;
}
