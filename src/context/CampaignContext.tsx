import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { defaultCampaignData } from '../types';
import type { CampaignData } from '../types';

interface CampaignContextType {
  data: CampaignData;
  setData: (data: CampaignData | ((prev: CampaignData) => CampaignData)) => void;
}

const CampaignContext = createContext<CampaignContextType | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useLocalStorage<CampaignData>('dnd-campaign-data', defaultCampaignData);

  return (
    <CampaignContext.Provider value={{ data, setData }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (!context) throw new Error('useCampaign must be used within CampaignProvider');
  return context;
}
