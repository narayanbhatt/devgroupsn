import { useCallback, useEffect, useState } from 'react';

type State<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

/**
 * Small loader hook giving every screen loading / error / success states (§48).
 * `key` identifies what is being loaded (e.g. a product id); a new key reloads.
 */
export function useAsync<T>(load: () => Promise<T>, key = '') {
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ status: 'success', data }))
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
        }
      });
    return () => {
      cancelled = true;
    };
    // `load` is usually an inline closure; reload only when the key or attempt changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
