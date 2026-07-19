// Destination: apps/web/src/contexts/ConfirmProvider.tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ConfirmOptions {
  message: string;
  detail?: string;
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
);

/** Promise-based confirmation, so any hook/component can `await confirm({...})`
 *  instead of the delete dialog being drilled down as a prop from HomePage. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    opts: ConfirmOptions;
    resolve: (result: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  );

  const settle = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          message={pending.opts.message}
          detail={pending.opts.detail}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}
