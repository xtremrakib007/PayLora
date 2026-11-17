import { useState } from 'react';
import { del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtShort, titleCase, today } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { isAdmin, isManager } from '../lib/modules';
import { Badge, Empty, Field, Modal, Seg, Spinner, Stars, useConfirm, Who } from '../components/ui';
import { Icon } from '../components/Icon';

/* ───────── Job Board ───────── */
export function JobBoard() {
  const { me } = useAuth();
  const q = useGet<any[]>('/recruitment/jobs');
  const depts = useGet<any[]>('/departments');
  const [edit, setEdit] = useState<any>(null);
  const careers = `${location.origin}/careers/${me?.company?.slug}`;
  return (
    <div className="stack">
      <div className="banner info row between" style={{ margin: 0 }}><span>Public careers page: <a href={careers} target="_blank" rel="noreferrer"><b>{careers}</b></a> — open jobs appear there and candidates can apply.</span>
        <button className="btn sm" onClick={() => navigator.clipboard?.writeText(careers)}>Copy link</button></div>
      <div className="card">
        <div className="tools"><span className="grow" />{isAdmin(me?.role) && <button className="btn primary" onClick={() => setEdit({ title: '', departmentId: '', location: '', type: 'FULL_TIME', salaryRange: '', description: '', status: 'OPEN' })}><Icon name="plus" size={16} />Post a job</button>}</div>
        {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No job openings yet" /> : (
          <div className="tw"><table className="t"><thead><tr><th>Job</th><th>Department</th><th>Location</th><th>Type</th><th className="n">Applicants</th><th>Status</th><th /></tr></thead>
            <tbody>{q.data.map((j) => <tr key={j.id}><td><b>{j.title}</b><div className="small faint">{j.salaryRange}</div></td><td>{j.departmentName || '—'}</td><td>{j.location || '—'}</td><td>{titleCase(j.type)}</td><td className="n">{j.applicants}</td><td><Badge s={j.status} /></td>
              <td className="n">{isAdmin(me?.role) && <button className="btn sm" onClick={() => setEdit(j)}>Edit</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {edit && <JobForm job={edit} depts={depts.data || []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function JobForm({ job, depts, onClose }: { job: any; depts: any[]; onClose: () => void }) {
  const [f, setF] = useState({ ...job, departmentId: job.departmentId || '' });
  const confirm = useConfirm();
  const save = useAction(() => { const b = { title: f.title, departmentId: f.departmentId, location: f.location, type: f.type, salaryRange: f.salaryRange, description: f.description, status: f.status }; return job.id ? patch(`/recruitment/jobs/${job.id}`, b) : post('/recruitment/jobs', b); },
    { ok: 'Saved', invalidate: ['/recruitment'], onDone: onClose });
  const remove = useAction(() => del(`/recruitment/jobs/${job.id}`), { ok: 'Deleted', invalidate: ['/recruitment'], onDone: onClose });
  const bind = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal wide title={job.id ? 'Edit job' : 'Post a job'} onClose={onClose}
      footer={<>{job.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => (await confirm({ text: 'Delete this job and its applications?', danger: true, ok: 'Delete' })) && remove.run(undefined)}>Delete</button>}<button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Save</button></>}>
      <div className="form">
        <Field label="Title" full><input className="inp" {...bind('title')} /></Field>
        <Field label="Department"><select className="inp" {...bind('departmentId')}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Location"><input className="inp" {...bind('location')} /></Field>
        <Field label="Type"><select className="inp" {...bind('type')}>{['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
        <Field label="Salary range"><input className="inp" {...bind('salaryRange')} placeholder="RM 3,000 – 4,000" /></Field>
        <Field label="Status"><select className="inp" {...bind('status')}>{['DRAFT', 'OPEN', 'CLOSED'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
        <Field label="Description" full><textarea className="inp" rows={8} {...bind('description')} /></Field>
      </div>
    </Modal>
  );
}

/* ───────── Recruitment pipeline ───────── */
const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
export function Recruitment() {
  const { me } = useAuth();
  const jobs = useGet<any[]>('/recruitment/jobs');
  const [job, setJob] = useState('');
  const apps = useGet<any[]>(`/recruitment/applications${job ? '?jobId=' + job : ''}`);
  const [open, setOpen] = useState<any>(null);
  const [add, setAdd] = useState(false);
  return (
    <div className="stack">
      <div className="tools" style={{ margin: 0 }}>
        <select className="inp" value={job} onChange={(e) => setJob(e.target.value)}><option value="">All jobs</option>{jobs.data?.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select>
        <span className="grow" />{job && <button className="btn primary" onClick={() => setAdd(true)}><Icon name="plus" size={16} />Add candidate</button>}
      </div>
      {!apps.data ? <Spinner /> : (
        <div className="kanban">{STAGES.map((s) => { const list = apps.data!.filter((a) => a.stage === s); return (
          <div className="kcol" key={s}><h4>{titleCase(s)} · {list.length}</h4>
            {list.map((a) => <div className="kcard" key={a.id} onClick={() => setOpen(a)}><b>{a.name}</b><div className="small muted">{a.jobTitle}</div><div className="row between small"><Stars value={a.rating} /><span className="faint">{fmtShort(a.createdAt)}</span></div></div>)}
          </div>); })}
        </div>
      )}
      {open && <Candidate a={open} admin={isAdmin(me?.role)} onClose={() => setOpen(null)} />}
      {add && <AddCandidate jobId={job} onClose={() => setAdd(false)} />}
    </div>
  );
}

function Candidate({ a, admin, onClose }: { a: any; admin: boolean; onClose: () => void }) {
  const [f, setF] = useState({ stage: a.stage, rating: a.rating, notes: a.notes || '' });
  const [hire, setHire] = useState({ joinDate: today(), basicSalary: '' });
  const save = useAction(() => patch(`/recruitment/applications/${a.id}`, f), { ok: 'Saved', invalidate: ['/recruitment'], onDone: onClose });
  const doHire = useAction(() => post(`/recruitment/applications/${a.id}/hire`, { joinDate: hire.joinDate, basicSalary: Number(hire.basicSalary) || 0, startOnboarding: true }), { ok: 'Hired — employee profile created', invalidate: ['/recruitment', '/employees', '/onboarding'], onDone: onClose });
  return (
    <Modal wide title={a.name} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => save.run(undefined)}>Save</button></>}>
      <div className="grid g2">
        <div>
          <div className="list-row"><span className="muted grow">Job</span><b>{a.jobTitle}</b></div>
          <div className="list-row"><span className="muted grow">Email</span><a href={`mailto:${a.email}`}>{a.email}</a></div>
          <div className="list-row"><span className="muted grow">Phone</span>{a.phone || '—'}</div>
          <div className="list-row"><span className="muted grow">Résumé</span>{a.resumeUrl ? <a href={a.resumeUrl} target="_blank" rel="noreferrer">Open</a> : '—'}</div>
          <div className="list-row"><span className="muted grow">Applied</span>{fmtDate(a.createdAt)}</div>
          {a.coverLetter && <p style={{ whiteSpace: 'pre-wrap' }} className="small">{a.coverLetter}</p>}
        </div>
        <div className="stack">
          <Field label="Stage"><select className="inp" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{STAGES.filter((s) => s !== 'HIRED' || a.stage === 'HIRED').map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
          <Field label="Rating"><Stars value={f.rating} onChange={(n) => setF({ ...f, rating: n })} /></Field>
          <Field label="Notes"><textarea className="inp" rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          {admin && !a.employeeId && (
            <div className="card" style={{ background: 'var(--brand-l)', boxShadow: 'none' }}><b>Hire this candidate</b>
              <div className="form" style={{ marginTop: 8 }}>
                <Field label="Start date"><input className="inp" type="date" value={hire.joinDate} onChange={(e) => setHire({ ...hire, joinDate: e.target.value })} /></Field>
                <Field label="Basic salary"><input className="inp num" type="number" value={hire.basicSalary} onChange={(e) => setHire({ ...hire, basicSalary: e.target.value })} /></Field>
              </div>
              <button className="btn primary" style={{ marginTop: 10 }} onClick={() => doHire.run(undefined)}>Hire & start onboarding</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AddCandidate({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', resumeUrl: '' });
  const save = useAction(() => post(`/recruitment/jobs/${jobId}/applications`, f), { ok: 'Candidate added', invalidate: ['/recruitment'], onDone: onClose });
  return (
    <Modal title="Add candidate" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Add</button></>}>
      <div className="form">{(['name', 'email', 'phone', 'resumeUrl'] as const).map((k) => <Field key={k} label={titleCase(k === 'resumeUrl' ? 'Résumé link' : k)}><input className="inp" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
    </Modal>
  );
}

/* ───────── Onboarding ───────── */
export function Onboarding() {
  const { me } = useAuth();
  const admin = isAdmin(me?.role);
  const q = useGet<any[]>(isManager(me?.role) ? '/onboarding' : '/onboarding/mine');
  const tpls = useGet<any[]>(admin ? '/onboarding/templates' : null);
  const emps = useGet<any[]>(admin ? '/employees?status=ACTIVE' : null);
  const toggle = useAction(([id, done]: [string, boolean]) => patch(`/onboarding/tasks/${id}`, { done }), { invalidate: ['/onboarding'] });
  const start = useAction((b: any) => post('/onboarding', b), { ok: 'Onboarding started', invalidate: ['/onboarding'], onDone: () => setNew(null) });
  const [nw, setNew] = useState<any>(null);
  const [tplEdit, setTplEdit] = useState<any>(null);
  return (
    <div className="stack">
      {admin && <div className="row"><span className="grow" /><button className="btn" onClick={() => setTplEdit(tpls.data?.[0] || { name: 'New template', tasks: [] })}>Edit checklist template</button>
        <button className="btn primary" onClick={() => setNew({ employeeId: '', templateId: tpls.data?.[0]?.id || '' })}><Icon name="plus" size={16} />Start onboarding</button></div>}
      {!q.data ? <Spinner /> : !q.data.length ? <div className="card"><Empty title="No onboarding in progress" /></div> : q.data.map((o) => {
        const done = o.tasks.filter((t: any) => t.done).length, pct = o.tasks.length ? Math.round((done / o.tasks.length) * 100) : 0;
        return (
          <div className="card" key={o.id} style={{ margin: 0 }}>
            <div className="hd"><div className="grow"><Who name={o.employeeName} sub={`${o.designation || ''} · starts ${fmtDate(o.startDate)}`} id={o.employeeId} /></div><b>{pct}%</b></div>
            <div className="bar" style={{ marginBottom: 10 }}><i style={{ width: pct + '%' }} /></div>
            {o.tasks.map((t: any) => {
              const mine = admin || (t.assignee === 'EMPLOYEE' && o.employeeId === me?.employee?.id) || (t.assignee === 'MANAGER' && isManager(me?.role));
              return <label key={t.id} className="list-row" style={{ cursor: mine ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={t.done} disabled={!mine} onChange={(e) => toggle.run([t.id, e.target.checked])} />
                <span className="grow" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--faint)' : undefined }}>{t.title}</span>
                <span className="badge">{titleCase(t.assignee)}</span><span className="small faint" style={{ width: 70, textAlign: 'right' }}>{t.dueDate ? fmtShort(t.dueDate) : ''}</span></label>;
            })}
          </div>);
      })}
      {nw && (
        <Modal title="Start onboarding" onClose={() => setNew(null)} footer={<><button className="btn" onClick={() => setNew(null)}>Cancel</button><button className="btn primary" disabled={!nw.employeeId} onClick={() => start.run(nw)}>Start</button></>}>
          <div className="form">
            <Field label="Employee" full><select className="inp" value={nw.employeeId} onChange={(e) => setNew({ ...nw, employeeId: e.target.value })}><option value="">Choose…</option>{emps.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label="Checklist" full><select className="inp" value={nw.templateId} onChange={(e) => setNew({ ...nw, templateId: e.target.value })}>{tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          </div>
        </Modal>
      )}
      {tplEdit && <TemplateEditor tpl={tplEdit} onClose={() => setTplEdit(null)} />}
    </div>
  );
}

function TemplateEditor({ tpl, onClose }: { tpl: any; onClose: () => void }) {
  const [f, setF] = useState<any>({ name: tpl.name, tasks: tpl.tasks.map((t: any) => ({ ...t })) });
  const save = useAction(() => (tpl.id ? patch(`/onboarding/templates/${tpl.id}`, f) : post('/onboarding/templates', f)), { ok: 'Template saved', invalidate: ['/onboarding'], onDone: onClose });
  const upd = (i: number, k: string, v: any) => setF({ ...f, tasks: f.tasks.map((t: any, j: number) => (j === i ? { ...t, [k]: v } : t)) });
  return (
    <Modal wide title="Onboarding checklist template" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Save</button></>}>
      <Field label="Name"><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="stack" style={{ marginTop: 12, gap: 6 }}>
        {f.tasks.map((t: any, i: number) => (
          <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
            <input className="inp" value={t.title} onChange={(e) => upd(i, 'title', e.target.value)} />
            <select className="inp" style={{ width: 130 }} value={t.assignee} onChange={(e) => upd(i, 'assignee', e.target.value)}>{['HR', 'EMPLOYEE', 'MANAGER'].map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}</select>
            <input className="inp num" type="number" min="0" style={{ width: 90 }} value={t.dueDays} onChange={(e) => upd(i, 'dueDays', Number(e.target.value))} title="Due (days after start)" />
            <button className="iconbtn" onClick={() => setF({ ...f, tasks: f.tasks.filter((_: any, j: number) => j !== i) })}><Icon name="close" size={16} /></button>
          </div>))}
        <div><button className="btn sm" onClick={() => setF({ ...f, tasks: [...f.tasks, { title: '', assignee: 'HR', dueDays: 0 }] })}>+ Add task</button> <span className="small muted">Number = days after start date</span></div>
      </div>
    </Modal>
  );
}

/* ───────── Performance ───────── */
export function Performance() {
  const { me } = useAuth();
  const admin = isAdmin(me?.role), mgr = isManager(me?.role);
  const [tab, setTab] = useState<'goals' | 'reviews' | 'cycles'>('goals');
  return (
    <div className="stack">
      <div className="row"><Seg value={tab} onChange={setTab} options={[['goals', 'Goals'], ['reviews', 'Reviews'], ...(admin ? [['cycles', 'Review cycles']] as [typeof tab, string][] : [])]} /></div>
      {tab === 'goals' && <Goals mgr={mgr} />}{tab === 'reviews' && <Reviews />}{tab === 'cycles' && <Cycles />}
    </div>
  );
}

function Goals({ mgr }: { mgr: boolean }) {
  const { me } = useAuth();
  const q = useGet<any[]>('/performance/goals');
  const emps = useGet<any[]>(mgr ? '/employees?status=ACTIVE' : null);
  const [edit, setEdit] = useState<any>(null);
  const save = useAction((g: any) => (g.id ? patch(`/performance/goals/${g.id}`, { title: g.title, description: g.description, dueDate: g.dueDate, progress: Number(g.progress), status: g.status }) : post('/performance/goals', { ...g, progress: Number(g.progress) })), { ok: 'Saved', invalidate: ['/performance'], onDone: () => setEdit(null) });
  const remove = useAction((id: string) => del(`/performance/goals/${id}`), { invalidate: ['/performance'], onDone: () => setEdit(null) });
  return (
    <div className="card">
      <div className="tools"><span className="grow" /><button className="btn primary" onClick={() => setEdit({ employeeId: me?.employee?.id || '', title: '', description: '', dueDate: '', progress: 0, status: 'ON_TRACK' })}><Icon name="plus" size={16} />New goal</button></div>
      {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No goals yet" /> : q.data.map((g) => (
        <div className="list-row" key={g.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(g)}>
          <div className="grow"><b>{g.title}</b><div className="small muted">{g.employeeName}{g.dueDate ? ` · due ${fmtShort(g.dueDate)}` : ''}</div></div>
          <div style={{ width: 160 }}><div className="bar"><i style={{ width: g.progress + '%' }} /></div><div className="small faint right">{g.progress}%</div></div><Badge s={g.status} />
        </div>))}
      {edit && (
        <Modal title={edit.id ? 'Goal' : 'New goal'} onClose={() => setEdit(null)} footer={<>{edit.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => remove.run(edit.id)}>Delete</button>}<button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={() => save.run(edit)}>Save</button></>}>
          <div className="form">
            {!edit.id && mgr && <Field label="For" full><select className="inp" value={edit.employeeId} onChange={(e) => setEdit({ ...edit, employeeId: e.target.value })}>{emps.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>}
            <Field label="Goal" full><input className="inp" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Details" full><textarea className="inp" rows={2} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Due date"><input className="inp" type="date" value={edit.dueDate || ''} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} /></Field>
            <Field label="Status"><select className="inp" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['ON_TRACK', 'AT_RISK', 'BEHIND', 'DONE'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
            <Field label={`Progress: ${edit.progress}%`} full><input type="range" min="0" max="100" step="5" value={edit.progress} onChange={(e) => setEdit({ ...edit, progress: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Reviews() {
  const { me } = useAuth();
  const q = useGet<any[]>('/performance/reviews');
  const [open, setOpen] = useState<any>(null);
  const [f, setF] = useState({ rating: 0, comment: '' });
  const submit = useAction(([id, kind]: [string, string]) => post(`/performance/reviews/${id}/${kind}`, f), { ok: 'Review submitted', invalidate: ['/performance'], onDone: () => setOpen(null) });
  const mine = open?.employeeId === me?.employee?.id;
  return (
    <div className="card">
      {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No reviews yet">HR starts review cycles.</Empty> : (
        <div className="tw"><table className="t"><thead><tr><th>Employee</th><th>Cycle</th><th>Self</th><th>Manager</th><th>Status</th><th /></tr></thead>
          <tbody>{q.data.map((r) => <tr key={r.id}><td><Who name={r.employeeName} sub={r.designation} id={r.employeeId} /></td><td>{r.cycleName}</td><td><Stars value={r.selfRating} /></td><td><Stars value={r.managerRating} /></td><td><Badge s={r.status} /></td>
            <td className="n"><button className="btn sm" onClick={() => { setOpen(r); setF({ rating: 0, comment: '' }); }}>Open</button></td></tr>)}</tbody></table></div>
      )}
      {open && (
        <Modal wide title={`${open.employeeName} · ${open.cycleName}`} onClose={() => setOpen(null)} footer={<button className="btn" onClick={() => setOpen(null)}>Close</button>}>
          <div className="grid g2">
            <div><b>Self-assessment</b>{open.selfRating ? <><div><Stars value={open.selfRating} /></div><p style={{ whiteSpace: 'pre-wrap' }}>{open.selfComment}</p></> : <p className="muted">Not submitted yet.</p>}</div>
            <div><b>Manager review</b>{open.managerRating ? <><div><Stars value={open.managerRating} /></div><p style={{ whiteSpace: 'pre-wrap' }}>{open.managerComment}</p></> : <p className="muted">Not submitted yet.</p>}</div>
          </div>
          {open.status !== 'COMPLETED' && open.cycleStatus === 'ACTIVE' && ((mine && open.status === 'SELF_REVIEW') || (!mine && open.canManage)) && (
            <div className="card" style={{ background: '#f7f7f3', boxShadow: 'none', marginTop: 12 }}>
              <b>{mine ? 'Your self-assessment' : 'Your review as manager'}</b>
              <div style={{ margin: '8px 0' }}><Stars value={f.rating} onChange={(n) => setF({ ...f, rating: n })} /></div>
              <textarea className="inp" rows={4} placeholder="Strengths, achievements, areas to grow…" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
              <button className="btn primary" style={{ marginTop: 8 }} disabled={!f.rating} onClick={() => submit.run([open.id, mine ? 'self' : 'manager'])}>Submit</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Cycles() {
  const q = useGet<any[]>('/performance/cycles');
  const [f, setF] = useState({ name: '', startDate: today(), endDate: today(), status: 'DRAFT' });
  const add = useAction(() => post('/performance/cycles', f), { ok: 'Cycle created', invalidate: ['/performance'], onDone: () => setF({ ...f, name: '' }) });
  const upd = useAction(([id, status]: [string, string]) => patch(`/performance/cycles/${id}`, { status }), { ok: 'Updated', invalidate: ['/performance'] });
  return (
    <div className="card">
      <div className="tools"><input className="inp grow" placeholder="Cycle name, e.g. H2 2026 review" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="inp" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /><input className="inp" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        <button className="btn primary" disabled={!f.name} onClick={() => add.run(undefined)}>Create</button></div>
      {q.data?.map((c) => <div className="list-row" key={c.id}><b className="grow">{c.name}<div className="small muted">{fmtShort(c.startDate)} – {fmtShort(c.endDate)}</div></b><Badge s={c.status} />
        {c.status === 'DRAFT' && <button className="btn sm primary" onClick={() => upd.run([c.id, 'ACTIVE'])}>Launch (notify everyone)</button>}
        {c.status === 'ACTIVE' && <button className="btn sm" onClick={() => upd.run([c.id, 'CLOSED'])}>Close</button>}</div>)}
    </div>
  );
}

/* ───────── Training ───────── */
export function Training() {
  const { me } = useAuth();
  const admin = isAdmin(me?.role), mgr = isManager(me?.role);
  const mine = useGet<any[]>(me?.employee ? '/training/enrollments/mine' : null);
  const courses = useGet<any[]>(mgr ? '/training/courses' : null);
  const emps = useGet<any[]>(mgr ? '/employees?status=ACTIVE' : null);
  const setStatus = useAction(([id, status]: [string, string]) => patch(`/training/enrollments/${id}`, { status }), { ok: 'Updated', invalidate: ['/training'] });
  const [edit, setEdit] = useState<any>(null);
  const [assign, setAssign] = useState<any>(null);
  const saveCourse = useAction((c: any) => (c.id ? patch(`/training/courses/${c.id}`, c) : post('/training/courses', c)), { ok: 'Saved', invalidate: ['/training'], onDone: () => setEdit(null) });
  const doAssign = useAction(() => post(`/training/courses/${assign.course.id}/assign`, { employeeIds: assign.ids, dueDate: assign.dueDate || null }), { ok: (r: any) => `Assigned to ${r.assigned}`, invalidate: ['/training'], onDone: () => setAssign(null) });
  return (
    <div className="stack">
      {mine.data && (
        <div className="card"><h3>My learning</h3>
          {!mine.data.length ? <div className="muted">No courses assigned.</div> : mine.data.map((e) => (
            <div className="list-row" key={e.id}><div className="grow"><b>{e.course.title}</b><div className="small muted">{e.course.provider} · {e.course.durationHours} h{e.dueDate ? ` · due ${fmtShort(e.dueDate)}` : ''}</div></div>
              {e.course.url && <a className="btn sm" href={e.course.url} target="_blank" rel="noreferrer">Open</a>}
              <select className="inp" style={{ width: 140 }} value={e.status} onChange={(x) => setStatus.run([e.id, x.target.value])}>{['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></div>))}
        </div>
      )}
      {courses.data && (
        <div className="card"><div className="hd"><h3>Course catalogue</h3>{admin && <button className="btn primary" onClick={() => setEdit({ title: '', provider: '', durationHours: 1, url: '', description: '' })}><Icon name="plus" size={16} />Add course</button>}</div>
          {!courses.data.length ? <Empty title="No courses yet" /> : (
            <div className="tw"><table className="t"><thead><tr><th>Course</th><th>Provider</th><th className="n">Hours</th><th className="n">Enrolled</th><th>Completion</th><th /></tr></thead>
              <tbody>{courses.data.map((c) => <tr key={c.id}><td><b>{c.title}</b><div className="small muted">{c.description}</div></td><td>{c.provider || '—'}</td><td className="n">{c.durationHours}</td><td className="n">{c.enrolled}</td>
                <td style={{ width: 140 }}><div className="bar"><i style={{ width: (c.enrolled ? (c.completed / c.enrolled) * 100 : 0) + '%' }} /></div><div className="small faint">{c.completed}/{c.enrolled}</div></td>
                <td className="n" style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => setAssign({ course: c, ids: [], dueDate: '' })}>Assign</button> {admin && <button className="btn sm" onClick={() => setEdit(c)}>Edit</button>}</td></tr>)}</tbody></table></div>
          )}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit course' : 'Add course'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={() => saveCourse.run({ id: edit.id, title: edit.title, provider: edit.provider, durationHours: Number(edit.durationHours), url: edit.url, description: edit.description })}>Save</button></>}>
          <div className="form">
            <Field label="Title" full><input className="inp" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Provider"><input className="inp" value={edit.provider || ''} onChange={(e) => setEdit({ ...edit, provider: e.target.value })} /></Field>
            <Field label="Hours"><input className="inp num" type="number" value={edit.durationHours} onChange={(e) => setEdit({ ...edit, durationHours: e.target.value })} /></Field>
            <Field label="Link" full><input className="inp" type="url" value={edit.url || ''} onChange={(e) => setEdit({ ...edit, url: e.target.value })} /></Field>
            <Field label="Description" full><textarea className="inp" rows={3} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {assign && (
        <Modal title={`Assign: ${assign.course.title}`} onClose={() => setAssign(null)} footer={<><button className="btn" onClick={() => setAssign(null)}>Cancel</button><button className="btn primary" disabled={!assign.ids.length} onClick={() => doAssign.run(undefined)}>Assign {assign.ids.length || ''}</button></>}>
          <Field label="Due date"><input className="inp" type="date" value={assign.dueDate} onChange={(e) => setAssign({ ...assign, dueDate: e.target.value })} /></Field>
          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 10 }}>{emps.data?.map((e) => <label key={e.id} className="list-row"><input type="checkbox" checked={assign.ids.includes(e.id)} onChange={(x) => setAssign({ ...assign, ids: x.target.checked ? [...assign.ids, e.id] : assign.ids.filter((i: string) => i !== e.id) })} />{e.name}<span className="faint small">{e.designation}</span></label>)}</div>
        </Modal>
      )}
    </div>
  );
}
