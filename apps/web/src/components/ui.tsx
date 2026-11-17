import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { avatarColor, initials, titleCase } from '../lib/format';

/* ── toasts ── */
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, bad }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), bad ? 5000 : 2600);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts">{list.map((t) => <div key={t.id} className={'toast' + (t.bad ? ' bad' : '')}>{t.text}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/* ── modal ── */
export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        {children}
        {footer && <div className="mfoot">{footer}</div>}
      </div>
    </div>
  );
}

/* ── confirm ── */
type ConfirmOpts = { title?: string; text: string; ok?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setSt({ ...o, resolve })), []);
  const done = (v: boolean) => { st?.resolve(v); setSt(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {st && (
        <Modal title={st.title || 'Please confirm'} onClose={() => done(false)}
          footer={<><button className="btn" onClick={() => done(false)}>Cancel</button><button className={'btn ' + (st.danger ? 'danger' : 'primary')} onClick={() => done(true)}>{st.ok || 'Confirm'}</button></>}>
          <p className="muted" style={{ margin: 0 }}>{st.text}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ── small pieces ── */
const TONE: Record<string, string> = {
  ACTIVE: 'ok', APPROVED: 'ok', PAID: 'ok', COMPLETED: 'ok', DONE: 'ok', HIRED: 'ok', OPEN: 'ok', PRESENT: 'ok', ACCEPTED: 'ok', RESOLVED: 'ok', ON_TRACK: 'ok',
  PENDING: 'warn', DRAFT: 'warn', IN_PROGRESS: 'info', FINALIZED: 'info', INTERVIEW: 'info', SCREENING: 'info', OFFER: 'brand', HALF_DAY: 'warn', AT_RISK: 'warn', MANAGER_REVIEW: 'info', SELF_REVIEW: 'warn', ASSIGNED: 'warn', TODO: 'warn', ON_NOTICE: 'warn',
  brand: 'brand', REJECTED: 'bad', ABSENT: 'bad', CANCELLED: 'bad', RESIGNED: 'bad', TERMINATED: 'bad', DECLINED: 'bad', BEHIND: 'bad', CLOSED: '', SUSPENDED: 'bad', HIGH: 'bad', MEDIUM: 'warn', LOW: '', LEAVE: 'info',
};
export const Badge = ({ s, children }: { s?: string | null; children?: ReactNode }) => <span className={'badge ' + (TONE[s || ''] ?? '')}>{children ?? titleCase(s)}</span>;
export const Avatar = ({ name, id, size = 32 }: { name: string; id?: string; size?: number }) => (
  <div className="av" style={{ background: avatarColor(id || name), width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</div>
);
export const Who = ({ name, sub, id }: { name: string; sub?: ReactNode; id?: string }) => (
  <div className="who"><Avatar name={name} id={id} /><div><b>{name}</b>{sub != null && <span>{sub}</span>}</div></div>
);
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><b>{title}</b>{children}</div>;
export const Spinner = () => <div className="spin" />;
export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return <div className={'field' + (full ? ' full' : '')}><label>{label}</label>{children}</div>;
}
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
export function Stars({ value, onChange }: { value?: number | null; onChange?: (n: number) => void }) {
  return <span className="stars">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={(value || 0) >= n ? 'on' : ''} onClick={() => onChange?.(n)} disabled={!onChange}>★</button>)}</span>;
}

/** Controlled form state helper. */
export function useForm<T extends Record<string, any>>(init: T) {
  const [v, setV] = useState<T>(init);
  const bind = (k: keyof T) => ({ value: v[k] ?? '', onChange: (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value })) });
  return { v, setV, bind, set: (k: keyof T, val: any) => setV((s) => ({ ...s, [k]: val })) };
}
