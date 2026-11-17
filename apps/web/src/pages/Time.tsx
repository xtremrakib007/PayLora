import { useState } from 'react';
import { del, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addDays, fmtDate, fmtMins, fmtShort, fmtTime, thisMonth, titleCase, today } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { isAdmin, isManager } from '../lib/modules';
import { Badge, Empty, Field, Modal, Seg, Spinner, useConfirm, Who } from '../components/ui';
import { Icon } from '../components/Icon';
import { ClockButton, SelfieThumbs } from '../components/Selfie';

/* ───────── Attendance ───────── */
const MARKS: [string, string, string][] = [['PRESENT', 'P', 'var(--ok)'], ['ABSENT', 'A', 'var(--bad)'], ['HALF_DAY', 'H', 'var(--warn)'], ['LEAVE', 'L', 'var(--info)']];

export function Attendance() {
  const { me } = useAuth();
  const mgr = isManager(me?.role);
  const [tab, setTab] = useState<'mine' | 'day' | 'month'>(mgr ? 'day' : 'mine');
  return (
    <div className="stack">
      <div className="row"><Seg value={tab} onChange={setTab} options={[...(me?.employee ? [['mine', 'My attendance']] as [typeof tab, string][] : []), ...(mgr ? [['day', 'Daily register'], ['month', 'Monthly summary']] as [typeof tab, string][] : [])]} /></div>
      {tab === 'mine' && <MyAttendance />}{tab === 'day' && <DayRegister />}{tab === 'month' && <MonthSummary />}
    </div>
  );
}

function MyAttendance() {
  const [period, setPeriod] = useState(thisMonth());
  const q = useGet<any>(`/me/attendance?period=${period}`);
  const t = q.data?.today;
  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#10251f,#0d6b5c)', color: '#fff' }}>
        <div className="row between">
          <div><div className="small" style={{ color: '#a9d3c7', fontWeight: 700 }}>TODAY · {fmtDate(today())}</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{t?.clockIn ? (t.clockOut ? 'Done for today' : 'Clocked in') : 'Not clocked in'}</div>
            <div style={{ color: '#cfe7e0' }}>{t?.clockIn ? `In ${fmtTime(t.clockIn)}${t.clockOut ? ` · Out ${fmtTime(t.clockOut)}` : ''}${t.lateMinutes ? ` · ${fmtMins(t.lateMinutes)} late` : t.late ? ' · late' : ''}${t.earlyMinutes ? ` · left ${fmtMins(t.earlyMinutes)} early` : ''}${t.clockInLoc?.distance != null ? ` · ${t.clockInLoc.distance} m from office` : ''}` : 'Your location is attached when your browser allows it.'}</div></div>
          {!t?.clockOut && <ClockButton action={t?.clockIn ? 'out' : 'in'} />}
        </div>
      </div>
      <div className="card">
        <div className="hd"><h3>History</h3><input className="inp" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} style={{ width: 'auto' }} /></div>
        {q.data?.summary && <div className="row" style={{ marginBottom: 12 }}>
          <span className="badge ok">Present {q.data.summary.present}</span><span className="badge bad">Absent {q.data.summary.absent}</span><span className="badge warn">Half {q.data.summary.half}</span>
          <span className="badge info">Leave {q.data.summary.leave}</span><span className="badge warn">Late {q.data.summary.late}×{q.data.summary.lateMinutes ? ` · ${fmtMins(q.data.summary.lateMinutes)}` : ''}</span><span className="badge warn">Early leave {q.data.summary.early}×{q.data.summary.earlyMinutes ? ` · ${fmtMins(q.data.summary.earlyMinutes)}` : ''}</span><span className="badge">OT {q.data.summary.otHours} h</span></div>}
        {!q.data ? <Spinner /> : !q.data.records.length ? <Empty title="No records this month" /> : (
          <div className="tw"><table className="t"><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th className="n">Hours</th><th className="n">OT</th></tr></thead>
            <tbody>{q.data.records.map((r: any) => <tr key={r.id}><td>{fmtDate(r.date)}</td><td><Badge s={r.status} />{(r.late || r.lateMinutes > 0) && <span className="badge warn" style={{ marginLeft: 4 }}>{r.lateMinutes ? `${fmtMins(r.lateMinutes)} late` : 'Late'}{r.lateWaived ? ' · excused' : ''}</span>}{r.earlyMinutes > 0 && <span className="badge warn" style={{ marginLeft: 4 }}>left {fmtMins(r.earlyMinutes)} early{r.earlyWaived ? ' · excused' : ''}</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.clockIn)}<SelfieThumbs inId={r.clockInPhotoId} outId={r.clockOutPhotoId} name="You" /></td><td>{fmtTime(r.clockOut)}</td><td className="n">{r.clockIn && r.clockOut ? ((new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000).toFixed(1) : '—'}</td><td className="n">{Number(r.otHours) || '—'}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </>
  );
}

function DayRegister() {
  const [date, setDate] = useState(today());
  const q = useGet<any>(`/attendance?date=${date}`);
  const mark = useAction((entries: any[]) => put('/attendance', { date, entries }), { invalidate: ['/attendance', '/home'] });
  const rows = q.data?.rows || [];
  const set = (employeeId: string, status: string | null, otHours?: number) => mark.run([{ employeeId, status, ...(otHours !== undefined && { otHours }) }]);
  const all = () => mark.run(rows.filter((r: any) => !r.record?.status).map((r: any) => ({ employeeId: r.employee.id, status: r.leave ? 'LEAVE' : 'PRESENT' })));
  return (
    <div className="card">
      <div className="tools">
        <button className="btn" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <input className="inp" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn" onClick={() => setDate(addDays(date, 1))}>›</button>
        <span className="grow" /><button className="btn" onClick={all} disabled={!rows.length}>Mark remaining present</button>
      </div>
      {!q.data ? <Spinner /> : !rows.length ? <Empty title="No active employees" /> : (
        <div className="tw"><table className="t"><thead><tr><th>Employee</th><th>Shift</th><th>Clock</th><th>Status</th><th className="n">Late (min)</th><th className="n">Early leave (min)</th><th className="n">OT hours</th></tr></thead>
          <tbody>{rows.map((r: any) => {
            const cur = r.record?.status;
            return (
              <tr key={r.employee.id}>
                <td><Who name={r.employee.name} sub={r.leave ? `On ${r.leave}` : r.employee.designation || r.employee.code} id={r.employee.id} /></td>
                <td>{r.shift ? <span className="chip" style={{ background: r.shift.color }}>{r.shift.name} {r.shift.start}–{r.shift.end}</span> : <span className="faint">—</span>}</td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{r.record?.clockIn ? `${fmtTime(r.record.clockIn)} – ${fmtTime(r.record.clockOut)}` : '—'}<SelfieThumbs inId={r.record?.clockInPhotoId} outId={r.record?.clockOutPhotoId} name={r.employee.name} /></td>
                <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>{MARKS.map(([v, l, c]) => (
                  <button key={v} className="btn sm" title={titleCase(v)} style={cur === v ? { background: c, borderColor: c, color: '#fff', width: 34 } : { width: 34 }} onClick={() => set(r.employee.id, cur === v ? null : v)}>{l}</button>))}</div></td>
                <td className="n"><MinutesCell mins={r.record?.lateMinutes} waived={r.record?.lateWaived} what="late" onSave={(lateMinutes, lateWaived) => mark.run([{ employeeId: r.employee.id, status: cur ?? 'PRESENT', lateMinutes, lateWaived }])} /></td>
                <td className="n"><MinutesCell mins={r.record?.earlyMinutes} waived={r.record?.earlyWaived} what="early leave" onSave={(earlyMinutes, earlyWaived) => mark.run([{ employeeId: r.employee.id, status: cur ?? 'PRESENT', earlyMinutes, earlyWaived }])} /></td>
                <td className="n"><input className="inp num" type="number" min="0" step="0.5" style={{ width: 80, textAlign: 'right' }} defaultValue={Number(r.record?.otHours) || ''} placeholder="0"
                  onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== (Number(r.record?.otHours) || 0)) set(r.employee.id, cur ?? null, v); }} /></td>
              </tr>);
          })}</tbody></table></div>
      )}
    </div>
  );
}

/** Editable late / early-leave minutes with an "excuse" toggle for the daily register. */
function MinutesCell({ mins: m, waived: w, what, onSave }: { mins?: number; waived?: boolean; what: string; onSave: (minutes: number, waived: boolean) => void }) {
  const mins = Number(m) || 0, waived = !!w;
  return (
    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 6 }}>
      <input key={mins} className="inp num" type="number" min="0" step="1" defaultValue={mins || ''} placeholder="0" title={`Minutes ${what}`}
        style={{ width: 70, textAlign: 'right', textDecoration: waived ? 'line-through' : undefined, borderColor: mins && !waived ? 'var(--warn)' : undefined }}
        onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== mins) onSave(v, waived); }} />
      {mins > 0 && <button className="btn sm" title={waived ? 'Count this lateness again' : 'Excuse — no pay deduction'} onClick={() => onSave(mins, !waived)}>{waived ? 'Undo excuse' : 'Excuse'}</button>}
    </div>
  );
}

function MonthSummary() {
  const [period, setPeriod] = useState(thisMonth());
  const q = useGet<any[]>(`/attendance/summary?period=${period}`);
  return (
    <div className="card">
      <div className="tools"><input className="inp" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></div>
      {!q.data ? <Spinner /> : (
        <div className="tw"><table className="t"><thead><tr><th>Employee</th><th className="n">Present</th><th className="n">Absent</th><th className="n">Half</th><th className="n">Leave</th><th className="n">Late</th><th className="n">Late time</th><th className="n">Early leave</th><th className="n">OT h</th><th className="n">Unpaid leave</th><th className="n">Unpaid days</th></tr></thead>
          <tbody>{q.data.map((r) => <tr key={r.employee.id}><td><Who name={r.employee.name} sub={r.employee.code} id={r.employee.id} /></td><td className="n">{r.present}</td><td className="n">{r.absent}</td><td className="n">{r.half}</td><td className="n">{r.leave}</td><td className="n">{r.late}</td><td className="n">{r.lateMinutes ? fmtMins(r.lateMinutes) : '—'}</td><td className="n">{r.earlyMinutes ? fmtMins(r.earlyMinutes) : '—'}</td><td className="n">{r.otHours}</td><td className="n">{r.unpaidLeaveDays}</td><td className="n"><b>{r.unpaidDays}</b></td></tr>)}</tbody></table></div>
      )}
      <p className="small muted">Unpaid days = absent + ½ × half days + approved unpaid leave. Late and early-leave time exclude excused days and are rounded per your settings. Payroll deducts them from basic salary only when those deductions are switched on in Settings.</p>
    </div>
  );
}

/* ───────── Leave ───────── */
export function Leave() {
  const { me } = useAuth();
  const mgr = isManager(me?.role);
  const [tab, setTab] = useState<'mine' | 'team' | 'balances'>(mgr ? 'team' : 'mine');
  const [status, setStatus] = useState(mgr ? 'PENDING' : '');
  const [apply, setApply] = useState(false);
  const confirm = useConfirm();
  const url = tab === 'mine' ? `/leave/requests?mine=1` : `/leave/requests?${status ? 'status=' + status : ''}`;
  const q = useGet<any[]>(tab === 'balances' ? null : url);
  const decide = useAction(([id, s]: [string, string]) => patch(`/leave/requests/${id}/decision`, { status: s }), { ok: 'Done', invalidate: ['/leave', '/home'] });
  const cancel = useAction((id: string) => post(`/leave/requests/${id}/cancel`), { ok: 'Cancelled', invalidate: ['/leave', '/home'] });
  return (
    <div className="stack">
      <div className="row">
        <Seg value={tab} onChange={setTab} options={[...(me?.employee ? [['mine', 'My leave']] as [typeof tab, string][] : []), ...(mgr ? [['team', 'Requests']] as [typeof tab, string][] : []), ['balances', 'Balances']]} />
        <span className="grow" />{(me?.employee || isAdmin(me?.role)) && <button className="btn primary" onClick={() => setApply(true)}><Icon name="plus" size={16} />Apply for leave</button>}
      </div>
      {tab === 'balances' ? <Balances mine={!mgr} /> : (
        <div className="card">
          {tab === 'team' && <div className="tools"><select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></div>}
          {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No leave requests" /> : (
            <div className="tw"><table className="t"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th className="n">Days</th><th>Reason</th><th>Status</th><th /></tr></thead>
              <tbody>{q.data.map((l) => (
                <tr key={l.id}><td><Who name={l.employeeName} sub={l.employeeCode} id={l.employeeId} /></td><td>{l.leaveType}{!l.paid && <span className="badge" style={{ marginLeft: 4 }}>unpaid</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(l.fromDate)}{l.toDate !== l.fromDate && ` → ${fmtShort(l.toDate)}`}</td><td className="n">{l.days}</td><td className="muted" style={{ maxWidth: 220 }}>{l.reason}</td><td><Badge s={l.status} /></td>
                  <td className="n" style={{ whiteSpace: 'nowrap' }}>
                    {tab === 'team' && l.status === 'PENDING' && l.employeeId !== me?.employee?.id && <><button className="btn sm" onClick={() => decide.run([l.id, 'REJECTED'])}>Reject</button> <button className="btn sm primary" onClick={() => decide.run([l.id, 'APPROVED'])}>Approve</button></>}
                    {(l.status === 'PENDING' || l.status === 'APPROVED') && (l.employeeId === me?.employee?.id || isAdmin(me?.role)) && <button className="btn sm ghost" onClick={async () => (await confirm({ text: 'Cancel this leave?', ok: 'Cancel leave', danger: true })) && cancel.run(l.id)}>Cancel</button>}
                  </td></tr>))}
              </tbody></table></div>
          )}
        </div>
      )}
      {apply && <ApplyLeave onClose={() => setApply(false)} />}
    </div>
  );
}

function Balances({ mine }: { mine: boolean }) {
  const [year, setYear] = useState(today().slice(0, 4));
  const q = useGet<any>(mine ? `/leave/my-balances?year=${year}` : `/leave/balances?year=${year}`);
  const types = (q.data?.types || []).filter((t: any) => t.daysPerYear > 0);
  return (
    <div className="card">
      <div className="tools"><select className="inp" value={year} onChange={(e) => setYear(e.target.value)}>{[0, 1, 2].map((k) => { const y = String(Number(today().slice(0, 4)) - k); return <option key={y}>{y}</option>; })}</select></div>
      {!q.data ? <Spinner /> : (
        <div className="tw"><table className="t"><thead><tr><th>Employee</th>{types.map((t: any) => <th key={t.id} className="n">{t.name}</th>)}</tr></thead>
          <tbody>{q.data.rows.map((r: any) => <tr key={r.employee.id}><td><Who name={r.employee.name} sub={r.employee.code} id={r.employee.id} /></td>
            {types.map((t: any) => { const b = r.balances.find((x: any) => x.leaveTypeId === t.id); return <td key={t.id} className="n"><b style={{ color: b.remaining < 0 ? 'var(--bad)' : undefined }}>{b.remaining}</b><span className="faint"> / {b.entitled}</span>{b.pending ? <div className="small faint">{b.pending} pending</div> : null}</td>; })}</tr>)}</tbody></table></div>
      )}
      <p className="small muted">Remaining / entitled days this year (pending requests count against the balance).</p>
    </div>
  );
}

function ApplyLeave({ onClose }: { onClose: () => void }) {
  const { me } = useAuth();
  const types = useGet<any[]>('/company/leave-types');
  const emps = useGet<any[]>(isAdmin(me?.role) ? '/employees?status=ACTIVE' : null);
  const [f, setF] = useState({ employeeId: '', leaveTypeId: '', fromDate: today(), toDate: today(), reason: '', halfDay: false });
  const save = useAction(() => post('/leave/requests', { ...f, employeeId: f.employeeId || undefined, leaveTypeId: f.leaveTypeId || types.data?.find((t) => t.active)?.id }), { ok: 'Leave request sent', invalidate: ['/leave', '/home'], onDone: onClose });
  return (
    <Modal title="Apply for leave" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => save.run(undefined)}>Submit</button></>}>
      <div className="form">
        {emps.data && <Field label="Employee (leave empty for yourself)" full><select className="inp" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}><option value="">Myself</option>{emps.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
        <Field label="Leave type" full><select className="inp" value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>{types.data?.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}{!t.paid ? ' (unpaid)' : ''}</option>)}</select></Field>
        <Field label="From"><input className="inp" type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: e.target.value > f.toDate ? e.target.value : f.toDate })} /></Field>
        <Field label="To"><input className="inp" type="date" value={f.toDate} min={f.fromDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} /></Field>
        {f.fromDate === f.toDate && <label className="full row"><input type="checkbox" checked={f.halfDay} onChange={(e) => setF({ ...f, halfDay: e.target.checked })} /> Half day</label>}
        <Field label="Reason" full><textarea className="inp" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
      <p className="small muted">Rest days and public holidays are not counted.</p>
    </Modal>
  );
}

/* ───────── Timesheets ───────── */
export function Timesheets() {
  const { me } = useAuth();
  const mgr = isManager(me?.role);
  const [tab, setTab] = useState<'mine' | 'team'>(me?.employee ? 'mine' : 'team');
  const [from, setFrom] = useState(addDays(today(), -13)), [to, setTo] = useState(today());
  const q = useGet<any[]>(`/timesheets?from=${from}&to=${to}${tab === 'mine' ? '&mine=1' : ''}`);
  const [add, setAdd] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const decide = useAction((status: string) => patch('/timesheets/decision', { ids: sel, status }), { ok: (r: any) => `${r.updated} updated`, invalidate: ['/timesheets'], onDone: () => setSel([]) });
  const remove = useAction((id: string) => del(`/timesheets/${id}`), { invalidate: ['/timesheets'] });
  const total = (q.data || []).reduce((s, r) => s + Number(r.hours), 0);
  const totals: Record<string, number> = {};
  (q.data || []).forEach((r) => { totals[r.project] = (totals[r.project] || 0) + Number(r.hours); });
  const byProject = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return (
    <div className="stack">
      <div className="row"><Seg value={tab} onChange={(v) => { setTab(v); setSel([]); }} options={[...(me?.employee ? [['mine', 'My timesheet']] as ['mine' | 'team', string][] : []), ...(mgr ? [['team', 'Team']] as ['mine' | 'team', string][] : [])]} />
        <span className="grow" />{me?.employee && <button className="btn primary" onClick={() => setAdd(true)}><Icon name="plus" size={16} />Log time</button>}</div>
      <div className="grid g3">
        <div className="tile"><div className="l">Total hours</div><div className="v num">{total.toFixed(1)}</div><div className="s">{fmtShort(from)} – {fmtShort(to)}</div></div>
        <div className="tile" style={{ gridColumn: 'span 2' }}><div className="l">By project</div><div className="row" style={{ marginTop: 6 }}>{byProject.slice(0, 8).map(([p, h]) => <span key={p} className="badge brand" style={{ padding: '5px 10px' }}>{p}: {h.toFixed(1)} h</span>)}{!byProject.length && <span className="faint">—</span>}</div></div>
      </div>
      <div className="card">
        <div className="tools"><input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span>to</span><input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="grow" />{tab === 'team' && sel.length > 0 && <><span className="muted">{sel.length} selected</span><button className="btn" onClick={() => decide.run('REJECTED')}>Reject</button><button className="btn primary" onClick={() => decide.run('APPROVED')}>Approve</button></>}</div>
        {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No time logged in this range" /> : (
          <div className="tw"><table className="t"><thead><tr>{tab === 'team' && <th />}<th>Date</th>{tab === 'team' && <th>Employee</th>}<th>Project</th><th>Task</th><th className="n">Hours</th><th>Status</th><th /></tr></thead>
            <tbody>{q.data.map((r) => <tr key={r.id}>
              {tab === 'team' && <td>{r.status === 'PENDING' && r.employeeId !== me?.employee?.id && <input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />}</td>}
              <td>{fmtShort(r.date)}</td>{tab === 'team' && <td>{r.employeeName}</td>}<td><b>{r.project}</b></td><td className="muted">{r.task}{r.notes ? ` — ${r.notes}` : ''}</td><td className="n">{Number(r.hours).toFixed(2)}</td><td><Badge s={r.status} /></td>
              <td className="n">{r.status === 'PENDING' && r.employeeId === me?.employee?.id && <button className="btn sm ghost" onClick={() => remove.run(r.id)}>Delete</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {add && <LogTime onClose={() => setAdd(false)} projects={[...new Set((q.data || []).map((r) => r.project))]} />}
    </div>
  );
}

function LogTime({ onClose, projects }: { onClose: () => void; projects: string[] }) {
  const [f, setF] = useState({ date: today(), project: projects[0] || '', task: '', hours: '', notes: '' });
  const save = useAction(() => post('/timesheets', { ...f, hours: Number(f.hours) }), { ok: 'Time logged', invalidate: ['/timesheets'], onDone: onClose });
  return (
    <Modal title="Log time" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Save</button></>}>
      <div className="form">
        <Field label="Date"><input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Hours"><input className="inp num" type="number" step="0.25" min="0.25" max="24" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        <Field label="Project" full><input className="inp" list="projects" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} /><datalist id="projects">{projects.map((p) => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Task" full><input className="inp" value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} /></Field>
        <Field label="Notes" full><textarea className="inp" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ───────── Shifts ───────── */
export function Shifts() {
  const { me } = useAuth();
  const mgr = isManager(me?.role);
  const monday = (() => { const d = new Date(today() + 'T00:00:00'); const k = (d.getDay() + 6) % 7; return addDays(today(), -k); })();
  const [from, setFrom] = useState(monday);
  const [mine, setMine] = useState(!mgr);
  const q = useGet<any>(`/shifts/roster?from=${from}&days=7${mine ? '&mine=1' : ''}`);
  const assign = useAction((items: any[]) => put('/shifts/assign', { items }), { invalidate: ['/shifts'] });
  const [tpl, setTpl] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const cell = (emp: string, d: string) => q.data?.assignments.find((a: any) => a.employeeId === emp && a.date === d);
  return (
    <div className="card">
      <div className="tools">
        <button className="btn" onClick={() => setFrom(addDays(from, -7))}>‹</button><b>{fmtShort(from)} – {fmtShort(addDays(from, 6))}</b><button className="btn" onClick={() => setFrom(addDays(from, 7))}>›</button>
        <button className="btn ghost" onClick={() => setFrom(monday)}>This week</button><span className="grow" />
        {mgr && <Seg value={mine ? 'mine' : 'team'} onChange={(v) => setMine(v === 'mine')} options={[['team', 'Team roster'], ['mine', 'My shifts']]} />}
        {isAdmin(me?.role) && <button className="btn" onClick={() => setTpl(true)}>Shift types</button>}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>{q.data?.templates.map((t: any) => <span key={t.id} className="chip" style={{ background: t.color }}>{t.name} {t.startTime}–{t.endTime}</span>)}</div>
      {!q.data ? <Spinner /> : (
        <div className="tw"><table className="t roster"><thead><tr><th>Employee</th>{days.map((d) => <th key={d}>{new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</th>)}</tr></thead>
          <tbody>{q.data.employees.map((e: any) => <tr key={e.id}><td><Who name={e.name} sub={e.designation} id={e.id} /></td>
            {days.map((d) => { const a = cell(e.id, d); return (
              <td key={d}>{mgr && !mine ? (
                <select className="inp" style={{ minWidth: 92, padding: '4px 6px', background: a ? a.color : '#fff', color: a ? '#fff' : 'inherit', fontWeight: 700, fontSize: 12 }} value={a?.templateId || ''}
                  onChange={(ev) => assign.run([{ employeeId: e.id, date: d, templateId: ev.target.value || null }])}>
                  <option value="">—</option>{q.data.templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              ) : a ? <span className="chip" style={{ background: a.color }}>{a.name}<br />{a.startTime}–{a.endTime}</span> : <span className="faint">—</span>}</td>); })}
          </tr>)}</tbody></table></div>
      )}
      {tpl && <ShiftTypes onClose={() => setTpl(false)} />}
    </div>
  );
}

function ShiftTypes({ onClose }: { onClose: () => void }) {
  const q = useGet<any[]>('/shifts/templates');
  const [f, setF] = useState({ name: '', startTime: '09:00', endTime: '18:00', color: '#2563b0' });
  const add = useAction(() => post('/shifts/templates', f), { invalidate: ['/shifts'], onDone: () => setF({ ...f, name: '' }) });
  const remove = useAction((id: string) => del(`/shifts/templates/${id}`), { invalidate: ['/shifts'] });
  return (
    <Modal title="Shift types" onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      {q.data?.map((t) => <div className="list-row" key={t.id}><span className="chip" style={{ background: t.color }}>{t.name}</span><span className="grow">{t.startTime} – {t.endTime}</span><button className="btn sm ghost" onClick={() => remove.run(t.id)}>Delete</button></div>)}
      <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
        <input className="inp" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="inp" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} style={{ width: 110 }} />
        <input className="inp" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} style={{ width: 110 }} />
        <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 40, height: 38, border: 0 }} />
        <button className="btn primary" disabled={!f.name} onClick={() => add.run(undefined)}>Add</button>
      </div>
    </Modal>
  );
}
