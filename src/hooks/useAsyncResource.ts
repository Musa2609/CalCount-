import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/utils';

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (next: T) => void;
}

/** Stable identity for caller-supplied loader inputs, so `loading` can be derived. */
function dependencyKey(deps: readonly unknown[]): string {
  return deps
    .map((dep) => {
      if (dep === null || dep === undefined) return String(dep);
      const type = typeof dep;
      if (type === 'string' || type === 'number' || type === 'boolean') {
        return `${type}:${String(dep)}`;
      }
      return Object.prototype.toString.call(dep);
    })
    .join('|');
}

/**
 * Runs an async loader whenever `deps` change.
 * Previous data stays visible while reloading so screens don't flash.
 *
 * Loading is derived from the request key rather than written in the effect,
 * which keeps the effect free of synchronous state updates.
 */
export function useAsyncResource<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [token, setToken] = useState(0);

  const loaderRef = useRef(loader);
  const requestKey = `${dependencyKey(deps)}|${enabled ? 'enabled' : 'disabled'}|${token}`;

  // Keep the newest loader available to the effect without touching it during render.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loaderRef
      .current()
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setErrorState(null);
      })
      .catch((cause) => {
        if (!cancelled) {
          setErrorState({
            key: requestKey,
            message: errorMessage(cause, 'Could not load this data.'),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSettledKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
    // Callers pass a fixed-length dependency list; the loader itself is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, token]);

  const reload = useCallback(() => setToken((value) => value + 1), []);

  return {
    data,
    loading: enabled && settledKey !== requestKey,
    error: errorState && errorState.key === requestKey ? errorState.message : null,
    reload,
    setData,
  };
}
