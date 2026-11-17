import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { get, post, setUnauthorizedHandler, tokenStore } from './api';
import { setCurrency } from './format';
import type { Role } from './modules';
import { registerForPush, unregisterPush } from './push';

export type Me = {
  user: { id: string; name: string; email: string; platformRole: string };
  company: { id: string; name: string; slug: string; currency: string } | null;
  role: Role | null;
  employee: { id: string; code: string; name: string; designation: string | null } | null;
  plan: { code: string } | null;
  modules: string[];
  memberships: { companyId: string; name: string; role: Role }[];
};
type Auth = {
  ready: boolean; me: Me | null; signedIn: boolean;
  signIn: (token: string) => Promise<void>; signOut: () => Promise<void>; switchCompany: (id: string) => Promise<void>;
  has: (m: string) => boolean; refresh: () => void;
};
const Ctx = createContext<Auth>(null as unknown as Auth);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { tokenStore.load().then((t) => { setSignedIn(!!t); setReady(true); }); }, []);
  const q = useQuery({ queryKey: ['/auth/me'], queryFn: () => get<Me>('/auth/me'), enabled: signedIn, staleTime: 60_000, retry: 1 });
  useEffect(() => { if (q.data?.company) setCurrency(q.data.company.currency); }, [q.data]);
  useEffect(() => { if (signedIn && q.data) registerForPush().catch(() => undefined); }, [signedIn, q.data?.user.id]);

  const signOut = async () => { await unregisterPush().catch(() => undefined); await tokenStore.set(null); qc.clear(); setSignedIn(false); };
  useEffect(() => setUnauthorizedHandler(() => { void signOut(); }), []);
  const signIn = async (t: string) => { await tokenStore.set(t); qc.clear(); setSignedIn(true); };
  const switchCompany = async (companyId: string) => { const r = await post<{ token: string }>('/auth/switch', { companyId }); await signIn(r.token); };

  return (
    <Ctx.Provider value={{ ready: ready && (!signedIn || !q.isLoading), me: signedIn ? q.data ?? null : null, signedIn, signIn, signOut, switchCompany, has: (m) => !!q.data?.modules.includes(m), refresh: () => q.refetch() }}>
      {children}
    </Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
