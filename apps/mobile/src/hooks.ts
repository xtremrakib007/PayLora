import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { get } from './api';

export function useGet<T = any>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery<T>({ queryKey: [path], queryFn: () => get<T>(path!), enabled: !!path, refetchInterval: opts.refetchInterval });
}

/** Run an action; on success refresh queries whose key starts with any `invalidate` prefix. */
export function useAction<A = any, R = any>(fn: (a: A) => Promise<R>, opts: { ok?: string; invalidate?: string[]; onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      const pre = opts.invalidate ?? [''];
      qc.invalidateQueries({ predicate: (q) => pre.some((p) => String(q.queryKey[0] ?? '').startsWith(p)) });
      if (opts.ok) Alert.alert(opts.ok);
      opts.onDone?.(r);
    },
    onError: (e: Error) => Alert.alert('Something went wrong', e.message),
  });
  return { run: m.mutateAsync, busy: m.isPending };
}
