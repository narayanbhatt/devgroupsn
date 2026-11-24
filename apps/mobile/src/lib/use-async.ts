import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  /** Loads again in the background, keeping what's on screen until the new data arrives. */
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry, refresh };
}

/** Reloads when the person comes back to a screen, so it never shows a stale status. */
export function useRefreshOnFocus(refresh: () => void) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refresh();
    }, [refresh]),
  );
}
