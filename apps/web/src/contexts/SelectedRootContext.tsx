import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// Last-selected project id, restored on startup. HomePage validates it against
// the loaded project list and falls back to the first project if it's stale.
const STORAGE_KEY = 'pb-last-project';

interface SelectedRootContextType {
  selectedRootId?: string;
  setSelectedRootId: (id?: string) => void;
}

const SelectedRootContext = createContext<SelectedRootContextType | undefined>(undefined);

export function SelectedRootProvider({ children }: { children: ReactNode }) {
  const [selectedRootId, setState] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined,
  );

  const setSelectedRootId = useCallback((id?: string) => {
    setState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

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
