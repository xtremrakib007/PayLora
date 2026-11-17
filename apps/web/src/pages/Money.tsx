import { useState } from 'react';
import { del, download, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addMonths, fmtDate, fmtMins, fmtShort, monthLabel, money, num, thisMonth, titleCase, today } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { isManager } from '../lib/modules';
import { Badge, Empty, Field, Modal, Seg, Spinner, useConfirm, Who } from '../components/ui';
import { Icon } from '../components/Icon';

/* ───────── Payroll (admin) ───────── */
export function Payroll() {
  const [period, setPeriod] = useState(thisMonth());
  const runs = useGet<any[]>('/payroll/runs');
  const run = useGet<any>(`/payroll/runs/${period}`);
  const exists = !run.error && run.data;
  const preview = useGet<any>(!exists && run.isFetched ? `/payroll/preview/${period}` : null);
  const confirm = useConfirm();
  const gen = useAction(() => post(`/payroll/runs/${period}/generate`), { ok: 'Payroll calculated', invalidate: ['/payroll', '/home'] });
  const status = useAction((s: string) => post(`/payroll/runs/${period}/status`, { status: s }), { ok: 'Updated', invalidate: ['/payroll', '/home'] });
  const remove = useAction(() => del(`/payroll/runs/${period}`), { ok: 'Run deleted', invalidate: ['/payroll'] });
  const [adj, setAdj] = useState<any>(null);
  const [slip, setSlip] = useState<any>(null);
  const r = run.data?.run, t = run.data?.totals, draft = r?.status === 'DRAFT';

  return (
    <div className="stack">
      <div className="card">
        <div className="tools">
          <button className="btn" onClick={() => setPeriod(addMonths(period, -1))}>‹</button>
          <input className="inp" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
          <button className="btn" onClick={() => setPeriod(addMonths(period, 1))}>›</button>
          {r && <Badge s={r.status} />}<span className="grow" />
          {r && <>
            {draft && <><button className="btn" onClick={() => gen.run(undefined)} disabled={gen.busy}>↻ Recalculate</button>
              <button className="btn primary" onClick={async () => (await confirm({ text: `Finalize ${monthLabel(period)} payroll? Figures lock and employees are notified that payslips are ready.`, ok: 'Finalize' })) && status.run('FINALIZED')}>Finalize</button>
              <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => (await confirm({ text: 'Delete this draft run?', danger: true, ok: 'Delete' })) && remove.run(undefined)}>Delete</button></>}
            {r.status === 'FINALIZED' && <><button className="btn primary" onClick={() => status.run('PAID')}>Mark as paid</button><button className="btn" onClick={() => status.run('DRAFT')}>Reopen</button></>}
            {r.status === 'PAID' && <><span className="muted small">Paid {fmtDate(r.paidAt)}</span><button className="btn" onClick={() => status.run('FINALIZED')}>Undo paid</button></>}
          </>}
        </div>
        {run.isLoading ? <Spinner /> : !exists ? (
          <Empty title={`No payroll for ${monthLabel(period)} yet`}>
            {preview.data && <div>{preview.data.count} employees · estimated net {money(preview.data.net)}</div>}
            <button className="btn primary" style={{ marginTop: 12 }} disabled={gen.busy} onClick={() => gen.run(undefined)}>{gen.busy ? 'Calculating…' : 'Generate payroll'}</button>
            <p className="small">Uses salaries, allowances, deductions, attendance, overtime, unpaid leave and approved claims.</p>
          </Empty>
        ) : <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <div className="tile" style={{ boxShadow: 'none', background: '#f7f7f3' }}><div className="l">Employees</div><div className="v num">{t.count}</div></div>
            <div className="tile" style={{ boxShadow: 'none', background: '#f7f7f3' }}><div className="l">Gross pay</div><div className="v num">{money(t.gross)}</div></div>
            <div className="tile" style={{ boxShadow: 'none', background: '#f7f7f3' }}><div className="l">Net pay</div><div className="v num" style={{ color: 'var(--brand)' }}>{money(t.net)}</div><div className="s">Deductions {money(t.deductions)}{t.reimbursements ? ` · Claims ${money(t.reimbursements)}` : ''}</div></div>
            <div className="tile" style={{ boxShadow: 'none', background: '#f7f7f3' }}><div className="l">Employer cost</div><div className="v num">{money(t.cost)}</div><div className="s">Contributions {money(t.employer)}</div></div>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn sm" onClick={() => download(`/payroll/runs/${period}/bank.csv`, `Bank_${period}.csv`)}><Icon name="download" size={14} />Bank transfer CSV</button>
            <button className="btn sm" onClick={() => download(`/payroll/runs/${period}/summary.csv`, `Payroll_${period}.csv`)}><Icon name="download" size={14} />Payroll CSV</button>
            <button className="btn sm primary" onClick={() => download(`/payroll/runs/${period}/payslips.pdf`, `Payslips_${period}.pdf`)}><Icon name="download" size={14} />All payslips (PDF)</button>
          </div>
          {!draft && <div className="banner info">This run is {r.status.toLowerCase()} and locked. Reopen it to change figures.</div>}
          <div className="tw"><table className="t">
            <thead><tr><th>Employee</th><th className="n">Basic</th><th className="n">Allow.</th><th className="n">OT</th><th className="n">Bonus</th><th className="n">Unpaid</th><th className="n">Late</th><th className="n">Gross</th><th className="n">Statutory</th><th className="n">PCB</th><th className="n">Other ded.</th><th className="n">Claims</th><th className="n">Net</th><th /></tr></thead>
            <tbody>{run.data.payslips.map((p: any) => { const d = p.data; return (
              <tr key={p.id}><td><Who name={d.employee.name} sub={d.employee.code + (d.note ? ` · ${d.note}` : '')} id={p.employeeId} /></td>
                <td className="n">{num(d.basic)}</td><td className="n">{num(d.allowanceTotal)}</td><td className="n">{d.otPay ? <>{num(d.otPay)}<div className="small faint">{d.otHours} h</div></> : '—'}</td>
                <td className="n">{d.bonus + d.otherEarnings ? num(d.bonus + d.otherEarnings) : '—'}</td><td className="n">{d.unpaidDeduction ? <>−{num(d.unpaidDeduction)}<div className="small faint">{d.unpaidDays} d</div></> : '—'}</td>
                <td className="n">{d.lateDeduction ? <>−{num(d.lateDeduction)}<div className="small faint">{fmtMins(d.lateMinutes)}</div></> : '—'}</td>
                <td className="n"><b>{num(d.gross)}</b></td><td className="n">{num(d.statutoryEmployee)}</td><td className="n">{d.tax ? num(d.tax) : '—'}</td><td className="n">{d.deductionTotal + d.otherDeduction ? num(d.deductionTotal + d.otherDeduction) : '—'}</td>
                <td className="n">{d.reimbursementTotal ? num(d.reimbursementTotal) : '—'}</td><td className="n"><b style={{ color: 'var(--brand)' }}>{num(d.net)}</b></td>
                <td className="n" style={{ whiteSpace: 'nowrap' }}>{draft && <button className="btn sm" onClick={() => setAdj(p)}>Adjust</button>} <button className="btn sm" onClick={() => setSlip({ ...p, period, status: r.status })}>View</button></td></tr>); })}
            </tbody>
            <tfoot><tr><td>Total</td><td colSpan={6} /><td className="n">{num(t.gross)}</td><td colSpan={4} /><td className="n">{num(t.net)}</td><td /></tr></tfoot>
          </table></div>
          <p className="small muted">Statutory contributions use the rates in Settings (simplified percentage method). Check them against the official contribution tables before paying.</p>
        </>}
      </div>
      {runs.data && runs.data.length > 0 && (
        <div className="card"><h3>Payroll history</h3>
          <div className="tw"><table className="t"><thead><tr><th>Period</th><th>Status</th><th className="n">Staff</th><th className="n">Gross</th><th className="n">Net</th><th className="n">Employer cost</th></tr></thead>
            <tbody>{runs.data.map((x) => <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setPeriod(x.period)}><td><b>{monthLabel(x.period)}</b></td><td><Badge s={x.status} /></td><td className="n">{x.count}</td><td className="n">{money(x.gross)}</td><td className="n">{money(x.net)}</td><td className="n">{money(x.cost)}</td></tr>)}</tbody></table></div>
        </div>
      )}
      {adj && <Adjust period={period} slip={adj} onClose={() => setAdj(null)} />}
      {slip && <Modal wide title="Payslip" onClose={() => setSlip(null)} footer={<><button className="btn" onClick={() => setSlip(null)}>Close</button><button className="btn primary" onClick={() => download(`/payslips/${slip.id}/pdf`, 'payslip.pdf')}>Download PDF</button></>}><PayslipView data={slip.data} period={slip.period} status={slip.status} /></Modal>}
    </div>
  );
}

function Adjust({ period, slip, onClose }: { period: string; slip: any; onClose: () => void }) {
  const a = slip.adjustments || {};
  const [f, setF] = useState<any>({ bonus: a.bonus ?? '', otherEarnings: a.otherEarnings ?? '', otHours: a.otHours ?? '', unpaidDays: a.unpaidDays ?? '', lateMinutes: a.lateMinutes ?? '', tax: a.tax ?? '', otherDeduction: a.otherDeduction ?? '', note: a.note ?? '' });
  const save = useAction(() => {
    const body: any = {};
    Object.entries(f).forEach(([k, v]) => { if (v !== '' && v != null) body[k] = k === 'note' ? v : Number(v); });
    return patch(`/payroll/runs/${period}/payslips/${slip.employeeId}`, body);
  }, { ok: 'Payslip updated', invalidate: ['/payroll'], onDone: onClose });
  const bind = (k: string) => ({ value: f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal title={`Adjust · ${slip.data.employee.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Apply</button></>}>
      <p className="muted small" style={{ marginTop: -6 }}>Leave OT hours / unpaid days / PCB blank to use attendance and the employee's settings.</p>
      <div className="form">
        <Field label="Bonus / commission"><input className="inp num" type="number" step="0.01" {...bind('bonus')} /></Field>
        <Field label="Other earnings"><input className="inp num" type="number" step="0.01" {...bind('otherEarnings')} /></Field>
        <Field label="Overtime hours"><input className="inp num" type="number" step="0.5" placeholder={String(slip.data.otHours)} {...bind('otHours')} /></Field>
        <Field label="Unpaid days"><input className="inp num" type="number" step="0.5" placeholder={String(slip.data.unpaidDays)} {...bind('unpaidDays')} /></Field>
        <Field label="Late minutes (0 = excuse all)"><input className="inp num" type="number" step="1" min="0" placeholder={String(slip.data.lateMinutes ?? 0)} {...bind('lateMinutes')} /></Field>
        <Field label="Income tax (PCB) this month"><input className="inp num" type="number" step="0.01" placeholder={String(slip.data.tax)} {...bind('tax')} /></Field>
        <Field label="One-off deduction"><input className="inp num" type="number" step="0.01" {...bind('otherDeduction')} /></Field>
        <Field label="Note on payslip" full><input className="inp" {...bind('note')} /></Field>
      </div>
    </Modal>
  );
}

export function PayslipView({ data: d, period, status }: { data: any; period: string; status?: string }) {
  const { me } = useAuth();
  const earn: [string, number][] = [['Basic salary', d.basic], ...d.allowances.map((a: any) => [a.name, a.amount])];
  if (d.otPay) earn.push([`Overtime (${d.otHours} h)`, d.otPay]); if (d.bonus) earn.push(['Bonus / commission', d.bonus]); if (d.otherEarnings) earn.push(['Other earnings', d.otherEarnings]);
  if (d.unpaidDeduction) earn.push([`Unpaid leave / absence (${d.unpaidDays} d)`, -d.unpaidDeduction]);
  if (d.lateDeduction) earn.push([`Late arrival (${fmtMins(d.lateMinutes)})`, -d.lateDeduction]);
  const ded: [string, number][] = d.statutory.filter((s: any) => s.employee).map((s: any) => [`${s.name} (employee)`, s.employee]);
  if (d.tax) ded.push(['Income tax (PCB)', d.tax]); d.deductions.forEach((x: any) => ded.push([x.name, x.amount])); if (d.otherDeduction) ded.push(['Other deduction', d.otherDeduction]);
  const Li = ([k, v]: [string, number]) => <div className="li" key={k}><span>{k}</span><span className="num">{v < 0 ? '−' + num(-v) : num(v)}</span></div>;
  return (
    <div className="slip">
      {status === 'DRAFT' && <div style={{ background: 'var(--warn-l)', color: 'var(--warn)', textAlign: 'center', fontWeight: 800, fontSize: 12, padding: 5 }}>DRAFT</div>}
      <div className="sh"><div><b style={{ fontSize: 17 }}>{me?.company?.name}</b><div className="small" style={{ color: '#cfe7e0' }}>{d.employee.name} · {d.employee.code} · {d.employee.designation}</div></div><div className="right"><b style={{ fontSize: 18 }}>PAYSLIP</b><div className="small" style={{ color: '#cfe7e0' }}>{monthLabel(period)}</div></div></div>
      <div className="sb">
        <div className="grid g2">
          <div><div className="sect" style={{ marginBottom: 6 }}>Earnings</div>{earn.map(Li)}<div className="li tot"><span>Gross earnings</span><span className="num">{num(d.gross)}</span></div></div>
          <div><div className="sect" style={{ marginBottom: 6 }}>Deductions</div>{ded.length ? ded.map(Li) : <div className="li faint">None</div>}<div className="li tot"><span>Total deductions</span><span className="num">{num(d.totalDeductions)}</span></div></div>
        </div>
        {d.reimbursements.length > 0 && <><div className="sect" style={{ margin: '12px 0 6px' }}>Reimbursements</div>{d.reimbursements.map((r: any) => Li([r.name, r.amount]))}</>}
        <div className="net"><span>NET PAY</span><span className="num" style={{ fontSize: 22, color: 'var(--brand-d)' }}>{money(d.net)}</span></div>
        {d.statutory.some((s: any) => s.employer) && <p className="small muted">Employer contributions: {d.statutory.filter((s: any) => s.employer).map((s: any) => `${s.name} ${num(s.employer)}`).join(' · ')}</p>}
        {d.note && <p className="small muted">Note: {d.note}</p>}
      </div>
    </div>
  );
}

/* ───────── My payslips ───────── */
export function MyPayslips() {
  const q = useGet<any[]>('/payslips/mine');
  const [open, setOpen] = useState<any>(null);
  return (
    <div className="card">
      {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No payslips yet">They appear here once HR finalizes payroll.</Empty> : (
        <div className="tw"><table className="t"><thead><tr><th>Period</th><th>Status</th><th className="n">Gross</th><th className="n">Deductions</th><th className="n">Net pay</th><th /></tr></thead>
          <tbody>{q.data.map((p) => <tr key={p.id}><td><b>{monthLabel(p.period)}</b></td><td><Badge s={p.status} /></td><td className="n">{money(p.gross)}</td><td className="n">{money(p.totalDeductions)}</td><td className="n"><b>{money(p.net)}</b></td>
            <td className="n" style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => setOpen(p)}>View</button> <button className="btn sm primary" onClick={() => download(`/payslips/${p.id}/pdf`, `Payslip_${p.period}.pdf`)}>PDF</button></td></tr>)}</tbody></table></div>
      )}
      {open && <Modal wide title="Payslip" onClose={() => setOpen(null)} footer={<><button className="btn" onClick={() => setOpen(null)}>Close</button><button className="btn primary" onClick={() => download(`/payslips/${open.id}/pdf`, `Payslip_${open.period}.pdf`)}>Download PDF</button></>}><PayslipView data={open.data} period={open.period} status={open.status} /></Modal>}
    </div>
  );
}

/* ───────── Claims ───────── */
export function Claims() {
  const { me } = useAuth();
  const mgr = isManager(me?.role);
  const [tab, setTab] = useState<'mine' | 'team'>(me?.employee ? 'mine' : 'team');
  const [status, setStatus] = useState(tab === 'team' ? 'PENDING' : '');
  const q = useGet<any[]>(`/claims?${tab === 'mine' ? 'mine=1' : status ? 'status=' + status : ''}`);
  const [add, setAdd] = useState(false);
  const decide = useAction(([id, s]: [string, string]) => patch(`/claims/${id}/decision`, { status: s }), { ok: 'Done', invalidate: ['/claims', '/home'] });
  const remove = useAction((id: string) => del(`/claims/${id}`), { ok: 'Withdrawn', invalidate: ['/claims'] });
  const total = (q.data || []).reduce((s, c) => s + Number(c.amount), 0);
  return (
    <div className="stack">
      <div className="row"><Seg value={tab} onChange={(v) => { setTab(v); setStatus(v === 'team' ? 'PENDING' : ''); }} options={[...(me?.employee ? [['mine', 'My claims']] as ['mine' | 'team', string][] : []), ...(mgr ? [['team', 'Approvals']] as ['mine' | 'team', string][] : [])]} />
        <span className="grow" />{me?.employee && <button className="btn primary" onClick={() => setAdd(true)}><Icon name="plus" size={16} />New claim</button>}</div>
      <div className="card">
        <div className="tools">{tab === 'team' && <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['PENDING', 'APPROVED', 'REJECTED', 'PAID'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>}
          <span className="grow" /><span className="muted">Total {money(total)}</span></div>
        {!q.data ? <Spinner /> : !q.data.length ? <Empty title="No claims">Approved claims are paid with the next payroll.</Empty> : (
          <div className="tw"><table className="t"><thead><tr><th>Date</th>{tab === 'team' && <th>Employee</th>}<th>Category</th><th>Description</th><th className="n">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>{q.data.map((c) => <tr key={c.id}><td>{fmtShort(c.date)}</td>{tab === 'team' && <td>{c.employeeName}</td>}<td>{c.category}</td>
              <td className="muted">{c.description}{c.receiptUrl && <> · <a href={c.receiptUrl} target="_blank" rel="noreferrer">receipt</a></>}</td><td className="n"><b>{money(c.amount)}</b></td><td><Badge s={c.status} />{c.runId && c.status === 'APPROVED' && <div className="small faint">in payroll</div>}</td>
              <td className="n" style={{ whiteSpace: 'nowrap' }}>
                {tab === 'team' && c.status === 'PENDING' && c.employeeId !== me?.employee?.id && <><button className="btn sm" onClick={() => decide.run([c.id, 'REJECTED'])}>Reject</button> <button className="btn sm primary" onClick={() => decide.run([c.id, 'APPROVED'])}>Approve</button></>}
                {tab === 'mine' && c.status === 'PENDING' && <button className="btn sm ghost" onClick={() => remove.run(c.id)}>Withdraw</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {add && <NewClaim onClose={() => setAdd(false)} />}
    </div>
  );
}

function NewClaim({ onClose }: { onClose: () => void }) {
  const cats = useGet<string[]>('/claims/categories');
  const [f, setF] = useState({ category: '', date: today(), amount: '', description: '', receiptUrl: '' });
  const save = useAction(() => post('/claims', { ...f, category: f.category || cats.data?.[0], amount: Number(f.amount) }), { ok: 'Claim submitted', invalidate: ['/claims'], onDone: onClose });
  return (
    <Modal title="New claim" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save.run(undefined)}>Submit</button></>}>
      <div className="form">
        <Field label="Category"><select className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.data?.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Date"><input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount"><input className="inp num" type="number" step="0.01" min="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Receipt link (optional)"><input className="inp" type="url" placeholder="https://" value={f.receiptUrl} onChange={(e) => setF({ ...f, receiptUrl: e.target.value })} /></Field>
        <Field label="Description" full><textarea className="inp" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
