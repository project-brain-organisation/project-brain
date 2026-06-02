import { createContext, useContext, useState, ReactNode } from 'react';

interface SelectedRootContextType {
  selectedRootId?: string;
  setSelectedRootId: (id?: string) => void;
}

const SelectedRootContext = createContext<SelectedRootContextType | undefined>(undefined);

export function SelectedRootProvider({ children }: { children: ReactNode }) {
  const [selectedRootId, setSelectedRootId] = useState<string | undefined>();

  return (
    <SelectedRootContext.Provider value={{ selectedRootId, setSelectedRootId }}>
      {children}
    </SelectedRootContext.Provider>
  );
}

export function useSelectedRoot() {
  const context = useContext(SelectedRootContext);
  if (!context) {
    throw new Error('useSelectedRoot must be used within SelectedRootProvider');
  }
  return context;
}
