import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGet } from '../lib/hooks';
import { Field, Spinner } from '../components/ui';

function Art() {
  return (
    <div className="art">
      <div className="brand" style={{ padding: 0 }}>PayLora</div>
      <div>
        <h2>All of HR in one place: payroll, leave, attendance, hiring and more.</h2>
        <p>Run payroll with statutory deductions, approve leave and claims, schedule shifts and meetings — and give every employee a mobile app for clock-in, payslips and tasks.</p>
      </div>
      <div style={{ color: '#9cc5ba', fontSize: 12 }}>Multi-company · Role-based access · Android app</div>
    </div>
  );
}

export function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await post<{ token: string }>('/auth/login', { email, password }); await signIn(r.token); nav('/'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth"><Art />
      <div className="pane"><form onSubmit={submit}>
        <h2 style={{ fontSize: 26 }}>Welcome back</h2>
        <p className="muted" style={{ margin: 0 }}>Sign in to your workspace.</p>
        {err && <div className="banner bad">{err}</div>}
        <Field label="Email"><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password"><input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted">New company? <Link to="/register">Create a free workspace</Link></p>
      </form></div>
    </div>
  );
}

export function Register() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ companyName: '', name: '', email: '', password: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await post<{ token: string }>('/auth/register', f); await signIn(r.token); nav('/'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth"><Art />
      <div className="pane"><form onSubmit={submit}>
        <h2 style={{ fontSize: 26 }}>Create your workspace</h2>
        <p className="muted" style={{ margin: 0 }}>Free for up to 5 employees. No card needed.</p>
        {err && <div className="banner bad">{err}</div>}
        <Field label="Company name"><input className="inp" {...bind('companyName')} required autoFocus /></Field>
        <Field label="Your name"><input className="inp" {...bind('name')} required /></Field>
        <Field label="Work email"><input className="inp" type="email" {...bind('email')} required /></Field>
        <Field label="Password (8+ characters)"><input className="inp" type="password" minLength={8} {...bind('password')} required /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
        <p className="muted">Already have an account? <Link to="/login">Sign in</Link></p>
      </form></div>
    </div>
  );
}

export function AcceptInvite() {
  const { token = '' } = useParams();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const info = useGet<{ email: string; role: string; company: string; hasAccount: boolean }>(`/auth/invite/${token}`);
  const [name, setName] = useState(''), [password, setPassword] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await post<{ token: string }>('/auth/accept-invite', { token, name: name || undefined, password }); await signIn(r.token); nav('/'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth"><Art />
      <div className="pane">
        {info.isLoading ? <Spinner /> : info.error ? <div className="banner bad">{(info.error as Error).message}</div> : (
          <form onSubmit={submit}>
            <h2 style={{ fontSize: 24 }}>Join {info.data!.company}</h2>
            <p className="muted" style={{ margin: 0 }}>You were invited as <b>{info.data!.role.toLowerCase()}</b> ({info.data!.email}).</p>
            {err && <div className="banner bad">{err}</div>}
            {!info.data!.hasAccount && <Field label="Your name"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
            <Field label={info.data!.hasAccount ? 'Your existing password' : 'Choose a password (8+ characters)'}><input className="inp" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button className="btn primary" disabled={busy}>{busy ? 'Joining…' : 'Accept invitation'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
