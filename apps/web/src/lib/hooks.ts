import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ui';
import { get } from './api';

/** GET a resource; the path is also the cache key. */
export function useGet<T = any>(path: string | null, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery<T>({ queryKey: [path], queryFn: () => get<T>(path!), enabled: !!path && opts.enabled !== false, refetchInterval: opts.refetchInterval });
}

/** Run an action, toast the outcome and refresh everything matching `invalidate` prefixes. */
export function useAction<A = any, R = any>(fn: (a: A) => Promise<R>, opts: { ok?: string | ((r: R) => string); invalidate?: string[]; onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      const pre = opts.invalidate ?? [''];
      qc.invalidateQueries({ predicate: (q) => pre.some((p) => String(q.queryKey[0] ?? '').startsWith(p)) });
      if (opts.ok) toast(typeof opts.ok === 'function' ? opts.ok(r) : opts.ok);
      opts.onDone?.(r);
    },
    onError: (e: Error) => toast(e.message, true),
  });
  return { run: m.mutateAsync, busy: m.isPending, mutate: m.mutate };
}
