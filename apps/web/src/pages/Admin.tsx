import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { del, download, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, monthLabel, money, titleCase } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { MODULE_LABELS } from '../lib/modules';
import { Badge, Empty, Field, Modal, Spinner, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';

/* ───────── Reporting ───────── */
function Bars({ rows, label, value, fmt = (n: number) => String(n) }: { rows: any[]; label: string; value: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  if (!rows.length) return <div className="muted small">No data yet.</div>;
  return <div>{rows.map((r, i) => <div key={i} className="list-row"><span style={{ width: 150 }} className="small">{r[label]}</span><div className="bar grow"><i style={{ width: ((Number(r[value]) || 0) / max) * 100 + '%' }} /></div><b className="num small" style={{ width: 110, textAlign: 'right' }}>{fmt(Number(r[value]) || 0)}</b></div>)}</div>;
}

export function Reports() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const q = useGet<any>(`/reports/overview?year=${year}`);
  const r = q.data;
  return (
    <div className="stack">
      <div className="tools" style={{ margin: 0 }}><select className="inp" value={year} onChange={(e) => setYear(e.target.value)}>{[0, 1, 2].map((k) => { const y = String(new Date().getFullYear() - k); return <option key={y}>{y}</option>; })}</select>
        <span className="grow" /><button className="btn" onClick={() => download('/reports/employees.csv', 'employees.csv')}><Icon name="download" size={16} />Employee list (CSV)</button></div>
      {!r ? <Spinner /> : <>
        <div className="grid g4">
          <div className="tile"><div className="l">Headcount</div><div className="v num">{r.headcount}</div><div className="s">{r.joiners} joined · {r.leavers} left in {year}</div></div>
          <div className="tile"><div className="l">Turnover rate</div><div className="v num">{r.turnoverRate}%</div><div className="s">Leavers ÷ current headcount</div></div>
          <div className="tile"><div className="l">Payroll cost {year}</div><div className="v num">{money(r.payrollTotals.cost)}</div><div className="s">Net paid {money(r.payrollTotals.net)}</div></div>
          <div className="tile"><div className="l">Attendance this month</div><div className="v num">{r.attendanceThisMonth.attendanceRate ?? '—'}{r.attendanceThisMonth.attendanceRate != null && '%'}</div><div className="s">{r.attendanceThisMonth.late} late arrivals</div></div>
        </div>
        <div className="grid g2">
          <div className="card" style={{ margin: 0 }}><h3>Payroll cost by month</h3><Bars rows={r.payroll.map((p: any) => ({ ...p, label: monthLabel(p.period) }))} label="label" value="cost" fmt={money} /></div>
          <div className="card" style={{ margin: 0 }}><h3>Headcount by department</h3><Bars rows={r.byDepartment} label="name" value="n" /></div>
          <div className="card" style={{ margin: 0 }}><h3>Leave days taken by type</h3><Bars rows={r.leave} label="type" value="days" /></div>
          <div className="card" style={{ margin: 0 }}><h3>Claims by category</h3><Bars rows={r.claims} label="category" value="amount" fmt={money} /></div>
        </div>
      </>}
    </div>
  );
}

/* ───────── Team & access ───────── */
export function Team() {
  const { me } = useAuth();
  const members = useGet<any[]>('/team/members');
  const invites = useGet<any[]>('/team/invites');
  const emps = useGet<any[]>('/employees?status=ACTIVE');
  const [inv, setInv] = useState<any>(null);
  const [link, setLink] = useState<string | null>(null);
  const upd = useAction(([id, b]: [string, any]) => patch(`/team/members/${id}`, b), { ok: 'Updated', invalidate: ['/team'] });
  const send = useAction(() => post('/team/invites', { ...inv, employeeId: inv.employeeId || null }), { invalidate: ['/team'], onDone: (r: any) => { setInv(null); setLink(r.link); } });
  const all = useAction(() => post('/team/invites/all-employees'), { ok: (r: any) => `${r.created} invitations created`, invalidate: ['/team'] });
  const revoke = useAction((id: string) => del(`/team/invites/${id}`), { invalidate: ['/team'] });
  const base = `${location.origin}/invite/`;
  return (
    <div className="stack">
      <div className="card">
        <div className="hd"><h3>Members</h3><button className="btn" onClick={() => all.run(undefined)}>Invite all employees with email</button><button className="btn primary" onClick={() => setInv({ email: '', role: 'EMPLOYEE', employeeId: '' })}><Icon name="plus" size={16} />Invite</button></div>
        {!members.data ? <Spinner /> : (
          <div className="tw"><table className="t"><thead><tr><th>Name</th><th>Role</th><th>Linked employee</th><th>Status</th></tr></thead>
            <tbody>{members.data.map((m) => <tr key={m.id}><td><b>{m.name}</b><div className="small muted">{m.email}</div></td>
              <td><select className="inp" style={{ width: 130 }} value={m.role} disabled={m.userId === me?.user.id} onChange={(e) => upd.run([m.id, { role: e.target.value }])}>{['OWNER', 'HR', 'MANAGER', 'EMPLOYEE'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select></td>
              <td><select className="inp" style={{ minWidth: 180 }} value={m.employeeId || ''} onChange={(e) => upd.run([m.id, { employeeId: e.target.value || null }])}><option value="">— Not linked —</option>{emps.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}</select></td>
              <td>{m.userId !== me?.user.id && <button className="btn sm" onClick={() => upd.run([m.id, { active: !m.active }])}>{m.active ? 'Deactivate' : 'Reactivate'}</button>} {!m.active && <Badge s="INACTIVE" />}</td></tr>)}</tbody></table></div>
        )}
        <p className="small muted">Owner/HR: full access · Manager: approves their direct reports · Employee: self-service. Link each account to an employee profile so they can clock in and see payslips.</p>
      </div>
      <div className="card"><h3>Pending invitations</h3>
        {!invites.data?.length ? <div className="muted">None.</div> : invites.data.map((i) => <div className="list-row" key={i.id}><span className="grow">{i.email} · {titleCase(i.role)}<div className="small faint">expires {fmtDate(i.expiresAt)}</div></span>
          <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(base + i.token); setLink(base + i.token); }}>Copy link</button><button className="btn sm ghost" onClick={() => revoke.run(i.id)}>Revoke</button></div>)}
      </div>
      {inv && (
        <Modal title="Invite to workspace" onClose={() => setInv(null)} footer={<><button className="btn" onClick={() => setInv(null)}>Cancel</button><button className="btn primary" onClick={() => send.run(undefined)}>Create invite</button></>}>
          <div className="form">
            <Field label="Email" full><input className="inp" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
            <Field label="Role"><select className="inp" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{['EMPLOYEE', 'MANAGER', 'HR', 'OWNER'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select></Field>
            <Field label="Link to employee"><select className="inp" value={inv.employeeId} onChange={(e) => { const emp = emps.data?.find((x) => x.id === e.target.value); setInv({ ...inv, employeeId: e.target.value, email: inv.email || emp?.email || '' }); }}><option value="">—</option>{emps.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          </div>
        </Modal>
      )}
      {link && <Modal title="Invitation link" onClose={() => setLink(null)} footer={<><button className="btn" onClick={() => setLink(null)}>Done</button><button className="btn primary" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button></>}>
        <p className="muted">Send this link to the person (WhatsApp, email…). It works for 14 days and also signs them in on the mobile app.</p><input className="inp" readOnly value={link} onFocus={(e) => e.target.select()} /></Modal>}
    </div>
  );
}

/* ───────── Settings ───────── */
export function Settings() {
  const q = useGet<any>('/company');
  const { refresh } = useAuth();
  const [co, setCo] = useState<any>(null), [stat, setStat] = useState<any[]>([]);
  useEffect(() => { if (q.data) { setCo({ ...q.data.company }); setStat(q.data.statutory.map((s: any) => ({ ...s }))); } }, [q.data]);
  const saveCo = useAction(() => patch('/company', {
    name: co.name, regNo: co.regNo, address: co.address, email: co.email, phone: co.phone, currency: co.currency, workingDays: Number(co.workingDays), hoursPerDay: Number(co.hoursPerDay), otRate: Number(co.otRate),
    restDays: co.restDays, workStart: co.workStart, officeLat: co.officeLat === '' || co.officeLat == null ? null : Number(co.officeLat), officeLng: co.officeLng === '' || co.officeLng == null ? null : Number(co.officeLng),
    geofenceMeters: Number(co.geofenceMeters) || 0, disabledModules: co.disabledModules,
  }), { ok: 'Settings saved', invalidate: ['/company', '/home'], onDone: () => refresh() });
  const saveStat = useAction(() => put('/company/statutory', stat.filter((s) => s.name).map((s) => ({ name: s.name, employeeRate: Number(s.employeeRate), employerRate: Number(s.employerRate), wageCap: Number(s.wageCap) || 0 }))), { ok: 'Contributions saved', invalidate: ['/company'] });
  const [lt, setLt] = useState({ name: '', daysPerYear: 0, paid: true });
  const addLt = useAction(() => post('/company/leave-types', { ...lt, daysPerYear: Number(lt.daysPerYear) }), { invalidate: ['/company'], onDone: () => setLt({ name: '', daysPerYear: 0, paid: true }) });
  const updLt = useAction(([id, b]: [string, any]) => patch(`/company/leave-types/${id}`, b), { invalidate: ['/company'] });
  const delLt = useAction((id: string) => del(`/company/leave-types/${id}`), { invalidate: ['/company'] });
  const [hol, setHol] = useState({ date: '', name: '' });
  const addHol = useAction(() => post('/company/holidays', hol), { invalidate: ['/company'], onDone: () => setHol({ date: '', name: '' }) });
  const delHol = useAction((id: string) => del(`/company/holidays/${id}`), { invalidate: ['/company'] });
  const useHere = () => navigator.geolocation?.getCurrentPosition((p) => setCo({ ...co, officeLat: p.coords.latitude.toFixed(6), officeLng: p.coords.longitude.toFixed(6), geofenceMeters: co.geofenceMeters || 200 }));
  if (!co) return <Spinner />;
  const bind = (k: string) => ({ value: co[k] ?? '', onChange: (e: any) => setCo({ ...co, [k]: e.target.value }) });
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div className="stack">
      <div className="card"><h3>Company</h3><div className="form">
        <Field label="Company name"><input className="inp" {...bind('name')} /></Field><Field label="Registration no."><input className="inp" {...bind('regNo')} /></Field>
        <Field label="Address" full><input className="inp" {...bind('address')} /></Field>
        <Field label="Email"><input className="inp" {...bind('email')} /></Field><Field label="Phone"><input className="inp" {...bind('phone')} /></Field>
        <Field label="Careers page"><input className="inp" readOnly value={`${location.origin}/careers/${co.slug}`} /></Field>
      </div></div>
      <div className="card"><h3>Work & payroll rules</h3><div className="form">
        <Field label="Currency"><input className="inp" {...bind('currency')} /></Field>
        <Field label="Work starts (late after)"><input className="inp" type="time" {...bind('workStart')} /></Field>
        <Field label="Working days per month (daily rate)"><input className="inp num" type="number" {...bind('workingDays')} /></Field>
        <Field label="Hours per day (hourly rate)"><input className="inp num" type="number" step="0.5" {...bind('hoursPerDay')} /></Field>
        <Field label="Overtime multiplier"><input className="inp num" type="number" step="0.1" {...bind('otRate')} /></Field>
        <Field label="Rest days"><div className="row">{DAYS.map((d, i) => <label key={d} className="badge" style={{ padding: '6px 9px', cursor: 'pointer' }}><input type="checkbox" checked={co.restDays.includes(i)} onChange={(e) => setCo({ ...co, restDays: e.target.checked ? [...co.restDays, i] : co.restDays.filter((x: number) => x !== i) })} /> {d}</label>)}</div></Field>
        <div className="sect">Clock-in geofence</div>
        <Field label="Office latitude"><input className="inp num" {...bind('officeLat')} /></Field><Field label="Office longitude"><input className="inp num" {...bind('officeLng')} /></Field>
        <Field label="Allowed radius in metres (0 = off)"><input className="inp num" type="number" {...bind('geofenceMeters')} /></Field>
        <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={useHere}><Icon name="pin" size={16} />Use my current location</button></div>
        <div className="sect">Apps</div>
        <div className="full row">{q.data.planModules.map((m: string) => <label key={m} className="badge" style={{ padding: '6px 10px', cursor: 'pointer' }}><input type="checkbox" checked={!co.disabledModules.includes(m)} onChange={(e) => setCo({ ...co, disabledModules: e.target.checked ? co.disabledModules.filter((x: string) => x !== m) : [...co.disabledModules, m] })} /> {MODULE_LABELS[m] || m}</label>)}</div>
        <div className="full small muted">Untick an app to hide it for everyone. More apps are available on higher plans.</div>
        <div className="full"><button className="btn primary" onClick={() => saveCo.run(undefined)}>Save settings</button></div>
      </div></div>
      <div className="card"><h3>Statutory contributions (% of gross pay)</h3>
        <div className="tw"><table className="t"><thead><tr><th>Name</th><th className="n">Employee %</th><th className="n">Employer %</th><th className="n">Wage cap (0 = none)</th><th /></tr></thead>
          <tbody>{stat.map((s, i) => <tr key={i}>{(['name', 'employeeRate', 'employerRate', 'wageCap'] as const).map((k) => <td key={k} className={k === 'name' ? '' : 'n'}><input className="inp" style={{ width: k === 'name' ? 140 : 100, textAlign: k === 'name' ? 'left' : 'right' }} value={s[k]} onChange={(e) => setStat(stat.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></td>)}
            <td><button className="iconbtn" onClick={() => setStat(stat.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button></td></tr>)}</tbody></table></div>
        <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setStat([...stat, { name: '', employeeRate: 0, employerRate: 0, wageCap: 0 }])}>+ Add</button><span className="grow" /><button className="btn primary" onClick={() => saveStat.run(undefined)}>Save contributions</button></div>
        <p className="small muted">Defaults are Malaysian EPF / SOCSO / EIS using a simplified flat-rate method (e.g. EPF employer is 12% above RM5,000). Check against official tables.</p>
      </div>
      <div className="grid g2">
        <div className="card" style={{ margin: 0 }}><h3>Leave types</h3>
          {q.data.leaveTypes.map((t: any) => <div className="list-row" key={t.id}><span className="grow" style={{ opacity: t.active ? 1 : 0.5 }}>{t.name}{!t.paid && <span className="badge" style={{ marginLeft: 6 }}>unpaid</span>}</span>
            <input className="inp num" type="number" style={{ width: 70 }} defaultValue={t.daysPerYear} onBlur={(e) => Number(e.target.value) !== t.daysPerYear && updLt.run([t.id, { daysPerYear: Number(e.target.value) }])} title="Days per year" />
            <button className="btn sm ghost" onClick={() => delLt.run(t.id)}>Remove</button></div>)}
          <div className="row" style={{ marginTop: 10, flexWrap: 'nowrap' }}><input className="inp" placeholder="New type" value={lt.name} onChange={(e) => setLt({ ...lt, name: e.target.value })} /><input className="inp num" type="number" style={{ width: 80 }} value={lt.daysPerYear} onChange={(e) => setLt({ ...lt, daysPerYear: Number(e.target.value) })} />
            <label className="row small"><input type="checkbox" checked={lt.paid} onChange={(e) => setLt({ ...lt, paid: e.target.checked })} />Paid</label><button className="btn" disabled={!lt.name} onClick={() => addLt.run(undefined)}>Add</button></div>
        </div>
        <div className="card" style={{ margin: 0 }}><h3>Public holidays</h3>
          {q.data.holidays.map((h: any) => <div className="list-row" key={h.id}><span style={{ width: 110 }}>{fmtDate(h.date)}</span><span className="grow">{h.name}</span><button className="btn sm ghost" onClick={() => delHol.run(h.id)}>Remove</button></div>)}
          <div className="row" style={{ marginTop: 10, flexWrap: 'nowrap' }}><input className="inp" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} style={{ width: 170 }} /><input className="inp" placeholder="Name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} /><button className="btn" disabled={!hol.date || !hol.name} onClick={() => addHol.run(undefined)}>Add</button></div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Billing ───────── */
export function Billing() {
  const q = useGet<any>('/billing');
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const [months, setMonths] = useState(1);
  const checkout = useAction((planCode: string) => post('/billing/checkout', { planCode, months }), { invalidate: ['/billing'], onDone: (r: any) => { if (r.url) location.href = r.url; else refresh(); } });
  const b = q.data;
  const payment = params.get('payment');
  return (
    <div className="stack">
      {payment === 'paid' && <div className="banner info">Payment received — your plan is active. Thank you!</div>}
      {payment === 'failed' && <div className="banner bad">The payment was not completed.</div>}
      {!b ? <Spinner /> : <>
        <div className="card"><div className="row between">
          <div><div className="muted small">Current plan</div><div style={{ fontSize: 24, fontWeight: 800 }}>{titleCase(b.effectivePlan.code)}</div>
            <div className="muted small">{b.subscription?.currentPeriodEnd && b.effectivePlan.code !== 'FREE' ? `Paid until ${fmtDate(b.subscription.currentPeriodEnd)}` : 'Free forever'} · {b.usage.activeEmployees}{b.effectivePlan.maxEmployees ? ` / ${b.effectivePlan.maxEmployees}` : ''} active employees</div></div>
          <div className="row"><span className="small muted">Prepay</span><select className="inp" style={{ width: 'auto' }} value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}{m === 12 ? ' (2 free)' : ''}</option>)}</select></div>
        </div></div>
        {!b.billingEnabled && <div className="banner">Online payment isn't configured on this server yet (set BILLPLZ_* in the API environment).</div>}
        {b.devMode && <div className="banner info">Development mode: upgrades activate instantly without payment.</div>}
        <div className="grid g3">{b.plans.map((p: any) => {
          const cur = p.code === b.effectivePlan.code, price = p.priceMonthly * (months === 12 ? 10 : months);
          return (
            <div className="card" key={p.code} style={{ margin: 0, outline: cur ? '2px solid var(--brand)' : undefined }}>
              <div className="row between"><h3 style={{ margin: 0 }}>{p.name}</h3>{cur && <Badge s="ACTIVE">Current</Badge>}</div>
              <div style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 0' }}>{p.priceMonthly ? money(p.priceMonthly) : 'Free'}<span className="small muted" style={{ fontWeight: 500 }}>{p.priceMonthly ? ' / month' : ''}</span></div>
              <div className="muted small">{p.maxEmployees ? `Up to ${p.maxEmployees} employees` : 'Unlimited employees'}</div>
              <div style={{ margin: '12px 0' }}>{p.modules.map((m: string) => <div key={m} className="small row" style={{ gap: 6 }}><Icon name="check" size={14} color="var(--brand)" />{MODULE_LABELS[m] || m}</div>)}</div>
              {p.priceMonthly > 0 && <button className="btn primary" style={{ width: '100%' }} disabled={!b.billingEnabled || checkout.busy} onClick={() => checkout.run(p.code)}>{cur ? 'Extend' : 'Upgrade'} · {money(price)}</button>}
            </div>);
        })}</div>
        {b.payments.length > 0 && <div className="card"><h3>Payments</h3><div className="tw"><table className="t"><thead><tr><th>Date</th><th>Plan</th><th className="n">Months</th><th className="n">Amount</th><th>Status</th></tr></thead>
          <tbody>{b.payments.map((p: any) => <tr key={p.id}><td>{fmtDate(p.createdAt)}</td><td>{titleCase(p.planCode)}</td><td className="n">{p.months}</td><td className="n">{money(p.amount)}</td><td><Badge s={p.status} /></td></tr>)}</tbody></table></div></div>}
      </>}
    </div>
  );
}

/* ───────── Super admin ───────── */
export function SuperAdmin() {
  const stats = useGet<any>('/admin/stats');
  const [q, setQ] = useState('');
  const cos = useGet<any[]>(`/admin/companies${q ? '?q=' + encodeURIComponent(q) : ''}`);
  const pays = useGet<any[]>('/admin/payments');
  const [edit, setEdit] = useState<any>(null);
  const confirm = useConfirm();
  const save = useAction((b: any) => patch(`/admin/companies/${edit.id}`, b), { ok: 'Company updated', invalidate: ['/admin'], onDone: () => setEdit(null) });
  const s = stats.data;
  return (
    <div className="stack">
      {s && <div className="grid g4">
        <div className="tile"><div className="l">Companies</div><div className="v num">{s.companies}</div><div className="s">{s.byPlan.map((p: any) => `${p.n} ${p.plan.toLowerCase()}`).join(' · ')}</div></div>
        <div className="tile"><div className="l">Users</div><div className="v num">{s.users}</div><div className="s">{s.activeEmployees} active employees</div></div>
        <div className="tile"><div className="l">MRR (list price)</div><div className="v num">{money(s.mrr)}</div></div>
        <div className="tile"><div className="l">Revenue</div><div className="v num">{money(s.revenue.total)}</div><div className="s">{money(s.revenue.last30)} last 30 days</div></div>
      </div>}
      <div className="card"><div className="tools"><input className="inp grow" placeholder="Search companies…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!cos.data ? <Spinner /> : !cos.data.length ? <Empty title="No companies" /> : (
          <div className="tw"><table className="t"><thead><tr><th>Company</th><th>Owner</th><th>Plan</th><th>Paid until</th><th className="n">Employees</th><th className="n">Members</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>{cos.data.map((c) => <tr key={c.id}><td><b>{c.name}</b><div className="small faint">/{c.slug}</div></td><td className="small">{c.owner}</td><td><Badge s="brand">{c.planCode}</Badge></td><td>{c.currentPeriodEnd ? fmtDate(c.currentPeriodEnd) : '—'}</td>
              <td className="n">{c.employees}</td><td className="n">{c.members}</td><td><Badge s={c.status} /></td><td>{fmtDate(c.createdAt)}</td>
              <td className="n" style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => setEdit({ ...c, until: c.currentPeriodEnd ? c.currentPeriodEnd.slice(0, 10) : '' })}>Manage</button></td></tr>)}</tbody></table></div>
        )}
      </div>
      {pays.data && pays.data.length > 0 && <div className="card"><h3>Recent payments</h3><div className="tw"><table className="t"><thead><tr><th>Date</th><th>Company</th><th>Plan</th><th className="n">Amount</th><th>Provider</th><th>Status</th></tr></thead>
        <tbody>{pays.data.map((p) => <tr key={p.id}><td>{fmtDate(p.createdAt)}</td><td>{p.company}</td><td>{p.planCode} × {p.months}</td><td className="n">{money(p.amount)}</td><td>{p.provider}</td><td><Badge s={p.status} /></td></tr>)}</tbody></table></div></div>}
      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)} footer={<>
          <button className={'btn ' + (edit.status === 'ACTIVE' ? 'danger' : '')} style={{ marginRight: 'auto' }} onClick={async () => (await confirm({ text: edit.status === 'ACTIVE' ? 'Suspend this company? Its users lose access until reactivated.' : 'Reactivate this company?', danger: edit.status === 'ACTIVE' })) && save.run({ status: edit.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{edit.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={() => save.run({ planCode: edit.planCode, currentPeriodEnd: edit.until ? new Date(edit.until + 'T23:59:59').toISOString() : null })}>Save plan</button></>}>
          <div className="form">
            <Field label="Plan"><select className="inp" value={edit.planCode} onChange={(e) => setEdit({ ...edit, planCode: e.target.value })}>{['FREE', 'PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Paid until"><input className="inp" type="date" value={edit.until} onChange={(e) => setEdit({ ...edit, until: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
