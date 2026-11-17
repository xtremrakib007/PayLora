import { useState } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, money, titleCase, today } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { isAdmin } from '../lib/modules';
import { Badge, Empty, Field, Modal, Spinner, useConfirm, Who } from '../components/ui';
import { Icon } from '../components/Icon';

type Line = { name: string; amount: number | string };
const STATUSES = ['ACTIVE', 'ON_NOTICE', 'RESIGNED', 'TERMINATED', 'INACTIVE'];
const TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

export function Employees() {
  const { me } = useAuth();
  const admin = isAdmin(me?.role);
  const [q, setQ] = useState(''), [dept, setDept] = useState(''), [status, setStatus] = useState(admin ? 'ACTIVE' : '');
  const params = new URLSearchParams({ ...(q && { q }), ...(dept && { departmentId: dept }), ...(status && { status }) }).toString();
  const list = useGet<any[]>(`/employees?${params}`);
  const depts = useGet<any[]>('/departments');
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [view, setView] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="tools">
        <input className="inp grow" placeholder="Search name, code, email, role…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
        <select className="inp" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        {admin && <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>}
        {admin && <button className="btn primary" onClick={() => setEdit(null)}><Icon name="plus" size={16} />Add employee</button>}
        {admin && <button className="btn" onClick={() => import('../lib/api').then((m) => m.download('/reports/employees.csv', 'employees.csv'))}>Export CSV</button>}
      </div>
      {list.isLoading ? <Spinner /> : !list.data?.length ? <Empty title="No employees found">{admin ? 'Add your first employee to get started.' : ''}</Empty> : (
        <div className="tw"><table className="t">
          <thead><tr><th>Employee</th><th>Code</th><th>Department</th><th>Type</th><th>Joined</th>{admin && <th className="n">Basic salary</th>}<th>Status</th><th>App</th><th /></tr></thead>
          <tbody>{list.data.map((e) => (
            <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setView(e.id)}>
              <td><Who name={e.name} sub={e.designation || e.email} id={e.id} /></td><td className="small">{e.code}</td><td>{e.departmentName || '—'}</td><td>{titleCase(e.type)}</td>
              <td>{fmtDate(e.joinDate)}</td>{admin && <td className="n">{money(e.basicSalary)}</td>}<td><Badge s={e.status} /></td>
              <td>{e.hasAccount ? <span className="badge ok">Linked</span> : <span className="badge">—</span>}</td>
              <td className="n">{admin && <button className="btn sm" onClick={(ev) => { ev.stopPropagation(); get(`/employees/${e.id}`).then(setEdit); }}>Edit</button>}</td>
            </tr>))}
          </tbody></table></div>
      )}
      {edit !== undefined && <EmployeeForm emp={edit} depts={depts.data || []} onClose={() => setEdit(undefined)} />}
      {view && <EmployeeView id={view} onClose={() => setView(null)} onEdit={(e) => { setView(null); setEdit(e); }} />}
    </div>
  );
}

function Lines({ label, value, onChange }: { label: string; value: Line[]; onChange: (l: Line[]) => void }) {
  return (
    <div className="field full"><label>{label}</label>
      {value.map((l, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="inp" placeholder="Name" value={l.name} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
          <input className="inp num" type="number" step="0.01" min="0" style={{ width: 140 }} placeholder="Amount" value={l.amount} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
          <button type="button" className="iconbtn" onClick={() => onChange(value.filter((_, k) => k !== i))}><Icon name="close" size={16} /></button>
        </div>))}
      <div><button type="button" className="btn sm" onClick={() => onChange([...value, { name: '', amount: '' }])}>+ Add line</button></div>
    </div>
  );
}

export function EmployeeForm({ emp, depts, onClose }: { emp: any | null; depts: any[]; onClose: () => void }) {
  const isNew = !emp;
  const all = useGet<any[]>('/employees?status=ACTIVE');
  const confirm = useConfirm();
  const [f, setF] = useState<any>(emp ? { ...emp } : { code: '', name: '', type: 'FULL_TIME', status: 'ACTIVE', joinDate: today(), basicSalary: '', monthlyTax: 0, applyStatutory: true, allowances: [], deductions: [] });
  const bind = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const save = useAction(() => {
    const body = { ...f, basicSalary: Number(f.basicSalary) || 0, monthlyTax: Number(f.monthlyTax) || 0,
      allowances: (f.allowances || []).filter((l: Line) => l.name || l.amount).map((l: Line) => ({ name: l.name, amount: Number(l.amount) || 0 })),
      deductions: (f.deductions || []).filter((l: Line) => l.name || l.amount).map((l: Line) => ({ name: l.name, amount: Number(l.amount) || 0 })) };
    ['id', 'companyId', 'createdAt', 'updatedAt', 'departmentName', 'manager', 'account'].forEach((k) => delete body[k]);
    return isNew ? post('/employees', body) : patch(`/employees/${emp.id}`, body);
  }, { ok: isNew ? 'Employee added' : 'Employee updated', invalidate: ['/employees', '/home', '/departments'], onDone: onClose });
  const remove = useAction(() => del(`/employees/${emp.id}`), { ok: 'Employee deleted', invalidate: ['/employees'], onDone: onClose });

  return (
    <Modal wide title={isNew ? 'Add employee' : `Edit ${emp.name}`} onClose={onClose}
      footer={<>{!isNew && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => (await confirm({ text: `Delete ${emp.name}? Their payslips and records will also be deleted. Consider setting the status to Resigned instead.`, ok: 'Delete', danger: true })) && remove.run(undefined)}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => save.run(undefined)}>{save.busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form">
        <div className="sect">Personal</div>
        <Field label="Full name *"><input className="inp" {...bind('name')} autoFocus /></Field>
        <Field label="Employee code (auto if empty)"><input className="inp" {...bind('code')} /></Field>
        <Field label="Email"><input className="inp" type="email" {...bind('email')} /></Field>
        <Field label="Phone"><input className="inp" {...bind('phone')} /></Field>
        <Field label="IC / Passport no."><input className="inp" {...bind('icNo')} /></Field>
        <Field label="Date of birth"><input className="inp" type="date" {...bind('dob')} /></Field>
        <Field label="Address" full><input className="inp" {...bind('address')} /></Field>
        <Field label="Emergency contact"><input className="inp" {...bind('emergencyName')} /></Field>
        <Field label="Emergency phone"><input className="inp" {...bind('emergencyPhone')} /></Field>
        <div className="sect">Employment</div>
        <Field label="Department"><select className="inp" {...bind('departmentId')}><option value="">— None —</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Designation"><input className="inp" {...bind('designation')} /></Field>
        <Field label="Reports to"><select className="inp" {...bind('managerId')}><option value="">— None —</option>{all.data?.filter((x) => x.id !== emp?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Employment type"><select className="inp" {...bind('type')}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
        <Field label="Status"><select className="inp" {...bind('status')}>{STATUSES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
        <Field label="Join date"><input className="inp" type="date" {...bind('joinDate')} /></Field>
        <Field label="Last working day"><input className="inp" type="date" {...bind('exitDate')} /></Field>
        <div className="sect">Salary</div>
        <Field label="Basic salary (monthly) *"><input className="inp num" type="number" min="0" step="0.01" {...bind('basicSalary')} /></Field>
        <Field label="Monthly income tax (PCB)"><input className="inp num" type="number" min="0" step="0.01" {...bind('monthlyTax')} /></Field>
        <label className="full row" style={{ fontWeight: 600 }}><input type="checkbox" checked={f.applyStatutory} onChange={(e) => setF({ ...f, applyStatutory: e.target.checked })} /> Apply statutory contributions (EPF / SOCSO / EIS — set in Settings)</label>
        <Lines label="Fixed monthly allowances" value={f.allowances || []} onChange={(l) => setF({ ...f, allowances: l })} />
        <Lines label="Recurring deductions (loans, advances…)" value={f.deductions || []} onChange={(l) => setF({ ...f, deductions: l })} />
        <div className="sect">Bank & statutory numbers</div>
        <Field label="Bank"><input className="inp" {...bind('bankName')} /></Field>
        <Field label="Account number"><input className="inp" {...bind('bankAccount')} /></Field>
        <Field label="EPF no."><input className="inp" {...bind('epfNo')} /></Field>
        <Field label="Income tax no."><input className="inp" {...bind('taxNo')} /></Field>
      </div>
    </Modal>
  );
}

function EmployeeView({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (e: any) => void }) {
  const { me } = useAuth();
  const q = useGet<any>(`/employees/${id}`);
  const bal = useGet<any>(isAdmin(me?.role) ? `/leave/balances?employeeId=${id}` : null);
  const e = q.data;
  const kv = (k: string, v: any) => <div className="list-row"><span className="muted grow">{k}</span><b className="right">{v || '—'}</b></div>;
  return (
    <Modal wide title={e ? <Who name={e.name} sub={`${e.designation || ''} · ${e.departmentName || 'No department'}`} id={e.id} /> : 'Employee'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button>{isAdmin(me?.role) && e && <button className="btn primary" onClick={() => onEdit(e)}>Edit</button>}</>}>
      {!e ? <Spinner /> : <>
        <div className="grid g2">
          <div>{kv('Code', e.code)}{kv('Email', e.email)}{kv('Phone', e.phone)}{kv('Status', <Badge s={e.status} />)}{kv('Type', titleCase(e.type))}{kv('Joined', fmtDate(e.joinDate))}{kv('Reports to', e.manager?.name)}</div>
          {e.basicSalary !== undefined && <div>{kv('Basic salary', money(e.basicSalary))}{(e.allowances || []).map((a: Line, i: number) => <div key={i}>{kv(a.name, money(a.amount))}</div>)}{kv('Monthly PCB', money(e.monthlyTax))}{kv('Bank', [e.bankName, e.bankAccount].filter(Boolean).join(' · '))}{kv('EPF no.', e.epfNo)}{kv('App account', e.account ? titleCase(e.account.role) : 'Not invited')}</div>}
        </div>
        {bal.data?.rows?.[0] && <>
          <div className="sect" style={{ marginTop: 16 }}>Leave balance {bal.data.year}</div>
          <div className="row" style={{ marginTop: 8 }}>{bal.data.types.filter((t: any) => t.daysPerYear).map((t: any, i: number) => {
            const b = bal.data.rows[0].balances.find((x: any) => x.leaveTypeId === t.id); return <span key={i} className="badge info" style={{ padding: '5px 10px' }}>{t.name}: {b?.remaining} / {t.daysPerYear}</span>; })}</div>
        </>}
      </>}
    </Modal>
  );
}

export function Departments() {
  const q = useGet<any[]>('/departments');
  const emps = useGet<any[]>('/employees?status=ACTIVE');
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const confirm = useConfirm();
  const save = useAction((d: any) => (d.id ? patch(`/departments/${d.id}`, { name: d.name, description: d.description, headId: d.headId }) : post('/departments', d)), { ok: 'Saved', invalidate: ['/departments'], onDone: () => setEdit(undefined) });
  const remove = useAction((id: string) => del(`/departments/${id}`), { ok: 'Deleted', invalidate: ['/departments'], onDone: () => setEdit(undefined) });
  return (
    <>
      <div className="tools"><button className="btn primary" onClick={() => setEdit({ name: '', description: '', headId: '' })}><Icon name="plus" size={16} />Add department</button></div>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <div className="card"><Empty title="No departments yet" /></div> : (
        <div className="grid g3">{q.data.map((d) => (
          <div className="card" key={d.id} style={{ margin: 0 }}>
            <div className="hd"><h3>{d.name}</h3><button className="btn sm" onClick={() => setEdit(d)}>Edit</button></div>
            <div className="muted small" style={{ minHeight: 18 }}>{d.description}</div>
            <div className="row between" style={{ marginTop: 12 }}><div><div className="faint small">HEAD</div>{emps.data?.find((e) => e.id === d.headId)?.name || '—'}</div><div className="right"><div className="faint small">STAFF</div><b>{d.staff}</b></div></div>
          </div>))}
        </div>
      )}
      {edit !== undefined && (
        <Modal title={edit.id ? 'Edit department' : 'Add department'} onClose={() => setEdit(undefined)}
          footer={<>{edit.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => (await confirm({ text: 'Delete this department?', danger: true, ok: 'Delete' })) && remove.run(edit.id)}>Delete</button>}
            <button className="btn" onClick={() => setEdit(undefined)}>Cancel</button><button className="btn primary" onClick={() => save.run(edit)}>Save</button></>}>
          <div className="form">
            <Field label="Name" full><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description" full><input className="inp" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Department head" full><select className="inp" value={edit.headId || ''} onChange={(e) => setEdit({ ...edit, headId: e.target.value })}><option value="">— None —</option>{emps.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

export function MyProfile() {
  const { me } = useAuth();
  const q = useGet<any>(me?.employee ? '/me/profile' : null);
  const [f, setF] = useState<any>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const save = useAction(() => patch('/me/profile', { phone: f.phone, address: f.address, emergencyName: f.emergencyName, emergencyPhone: f.emergencyPhone }), { ok: 'Profile updated', invalidate: ['/me/profile'] });
  const change = useAction(() => post('/auth/password', pw), { ok: 'Password changed', onDone: () => setPw({ current: '', next: '' }) });
  const e = q.data;
  if (e && !f) setF(e);
  return (
    <div className="grid g2">
      <div className="card" style={{ margin: 0 }}>
        <h3>My details</h3>
        {!me?.employee ? <div className="muted">Your account isn't linked to an employee profile.</div> : !f ? <Spinner /> : <div className="form">
          <Field label="Name"><input className="inp" value={e.name} disabled /></Field>
          <Field label="Employee code"><input className="inp" value={e.code} disabled /></Field>
          <Field label="Phone"><input className="inp" value={f.phone || ''} onChange={(x) => setF({ ...f, phone: x.target.value })} /></Field>
          <Field label="Address"><input className="inp" value={f.address || ''} onChange={(x) => setF({ ...f, address: x.target.value })} /></Field>
          <Field label="Emergency contact"><input className="inp" value={f.emergencyName || ''} onChange={(x) => setF({ ...f, emergencyName: x.target.value })} /></Field>
          <Field label="Emergency phone"><input className="inp" value={f.emergencyPhone || ''} onChange={(x) => setF({ ...f, emergencyPhone: x.target.value })} /></Field>
          <div className="full"><button className="btn primary" onClick={() => save.run(undefined)}>Save</button></div>
        </div>}
      </div>
      <div className="card" style={{ margin: 0 }}>
        <h3>Change password</h3>
        <div className="form">
          <Field label="Current password" full><input className="inp" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password (8+ characters)" full><input className="inp" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <div className="full"><button className="btn primary" disabled={pw.next.length < 8} onClick={() => change.run(undefined)}>Change password</button></div>
        </div>
      </div>
    </div>
  );
}
