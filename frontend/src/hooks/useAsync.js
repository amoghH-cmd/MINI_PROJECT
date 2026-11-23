import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError } from '../services/api.js';

// Runs an async loader; ignores responses that arrive after a newer request (no stale overwrites).
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader().then((data) => n === seq.current && setState({ loading: false, data, error: null }))
      .catch((e) => n === seq.current && setState({ loading: false, data: null, error: apiError(e).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
    return () => { seq.current += 1; };
  }, [reload]);
  return { ...state, reload };
}
