import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/http';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

/** Runs an async fetch, tracks loading/error/data with a reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fn()
      .then((r) => {
        if (mounted) {
          setData(r);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (mounted) {
          setError(e instanceof ApiError ? e : new ApiError({ statusCode: 0, code: 'UNKNOWN', message: 'Something went wrong.' }));
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}
