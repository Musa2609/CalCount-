import { useCallback, useRef, useState } from 'react';

/**
 * Guards a write action so a double tap (or an impatient second press) cannot
 * create duplicate rows. The busy flag also drives button spinners.
 */
export function useSubmit() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { submit, busy };
}
