import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect } from 'react';
import { get, post, setUnauthorizedHandler, tokenStore } from './api';
import { setCurrency } from './format';
import type { Role } from './modules';

export type Me = {
  user: { id: string; name: string; email: string; platformRole: 'USER' | 'SUPER_ADMIN' };
  company: { id: string; name: string; slug: string; currency: string; status: string; requireSelfie?: boolean } | null;
  role: Role | null;
  employee: { id: string; code: string; name: string; designation: string | null } | null;
  plan: { code: string; maxEmployees: number; modules: string[] } | null;
  modules: string[];
  memberships: { companyId: string; name: string; slug: string; role: Role; status: string }[];
};

type Auth = {
  me: Me | null; loading: boolean;
  signIn: (token: string) => Promise<void>; signOut: () => void; switchCompany: (id: string) => Promise<void>;
  has: (module: string) => boolean; can: (...roles: Role[]) => boolean; refresh: () => Promise<unknown>;
};
const Ctx = createContext<Auth>(null as unknown as Auth);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/auth/me'), enabled: !!tokenStore.get(), retry: false, staleTime: 60_000 });
  const me = tokenStore.get() ? q.data ?? null : null;
  useEffect(() => { if (me?.company) setCurrency(me.company.currency); }, [me?.company]);

  const signOut = useCallback(() => { tokenStore.set(null); qc.clear(); window.location.href = '/login'; }, [qc]);
  useEffect(() => setUnauthorizedHandler(() => { qc.clear(); if (!location.pathname.startsWith('/login')) location.href = '/login'; }), [qc]);

  const signIn = async (token: string) => { tokenStore.set(token); qc.clear(); await qc.fetchQuery({ queryKey: ['me'], queryFn: () => get<Me>('/auth/me') }); };
  const switchCompany = async (companyId: string) => { const r = await post<{ token: string }>('/auth/switch', { companyId }); await signIn(r.token); window.location.href = '/'; };

  const value: Auth = {
    me, loading: !!tokenStore.get() && q.isLoading, signIn, signOut, switchCompany, refresh: () => q.refetch(),
    has: (m) => !!me?.modules.includes(m), can: (...roles) => !!me?.role && roles.includes(me.role),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
