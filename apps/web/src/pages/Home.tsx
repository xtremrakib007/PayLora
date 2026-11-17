import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtDateTime, fmtMins, fmtShort, fmtTime, monthLabel, money, titleCase } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { APPS } from '../lib/modules';
import { Icon } from '../components/Icon';
import { ClockButton, SelfieThumbs } from '../components/Selfie';
import { Badge, Spinner, Who } from '../components/ui';

export { clockWithLocation } from '../components/Selfie';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner dashboard', HR: 'HR dashboard', MANAGER: 'Manager dashboard', EMPLOYEE: 'My dashboard' };

/** One dashboard per role: Owner (business), HR (operations), Manager (team), Employee (self-service). */
export function Home() {
  const { me } = useAuth();
  const q = useGet<any>('/home', { refetchInterval: 60_000 });
  const h = q.data;
  const hour = new Date().getHours();
  const role = me?.role || 'EMPLOYEE';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <div>
          <div className="row" style={{ gap: 8 }}><span className="badge brand">{ROLE_LABEL[role]}</span><span className="muted small">{me?.company?.name}</span></div>
          <h2 style={{ fontSize: 24, marginTop: 6 }}>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {me?.user.name.split(' ')[0]}</h2>
          <div className="muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </div>
      {!h ? <Spinner /> : <>
        {role === 'OWNER' && <OwnerView h={h} />}
        {role === 'HR' && <HrView h={h} />}
        {role === 'MANAGER' && <ManagerView h={h} />}
        {role === 'EMPLOYEE' && <EmployeeView h={h} />}
        <Launcher />
      </>}
    </div>
  );
}

/* ───────── building blocks ───────── */
const Tile = ({ label, value, sub, to, tone }: { label: string; value: ReactNode; sub?: ReactNode; to?: string; tone?: string }) => {
  const body = <><div className="l">{label}</div><div className="v num" style={tone ? { color: tone } : undefined}>{value}</div>{sub && <div className="s">{sub}</div>}</>;
  return to ? <Link to={to} className="tile" style={{ color: 'inherit' }}>{body}</Link> : <div className="tile">{body}</div>;
};
const Panel = ({ title, action, children, span }: { title: string; action?: ReactNode; children: ReactNode; span?: number }) => (
  <div className="card" style={{ margin: 0, gridColumn: span ? `span ${span}` : undefined }}><div className="hd"><h3>{title}</h3>{action}</div>{children}</div>
);

function Launcher() {
  const { me, has } = useAuth();
  const apps = APPS.filter((a) => !a.roles || (me?.role && a.roles.includes(me.role)));
  return (
    <div className="card"><h3>Apps</h3>
      <div className="apps">{apps.map((a) => {
        const on = has(a.module);
        return <Link key={a.key} to={on ? a.path : '/billing'} className={'app' + (on ? '' : ' locked')} title={on ? a.blurb : 'Not on your plan'}>
          <div className="ic" style={{ background: a.bg }}><Icon name={a.icon} size={34} color={a.fg} /></div>{a.title}</Link>;
      })}</div>
    </div>
  );
}

/** Personal clock-in card (everyone with an employee profile). */
function ClockCard({ h, compact }: { h: any; compact?: boolean }) {
  if (h.attendanceToday === undefined || !h.employee) return null;
  const t = h.attendanceToday;
  return (
    <div className="tile" style={{ gridColumn: compact ? undefined : 'span 2', alignSelf: 'start', background: 'linear-gradient(135deg,#10251f,#0d6b5c)', color: '#fff' }}>
      <div className="row between">
        <div>
          <div className="l" style={{ color: '#a9d3c7' }}>My attendance today</div>
          <div className="v">{t?.clockIn ? (t.clockOut ? 'Done for today' : 'Clocked in') : 'Not clocked in'}</div>
          <div className="s" style={{ color: '#cfe7e0' }}>
            {t?.clockIn ? `In ${fmtTime(t.clockIn)}${t.clockOut ? ` · Out ${fmtTime(t.clockOut)}` : ''}${t.lateMinutes ? ` · ${fmtMins(t.lateMinutes)} late` : ''}`
              : h.shiftToday ? `Shift ${h.shiftToday.name} ${h.shiftToday.start}–${h.shiftToday.end}` : 'Clock in here or in the mobile app'}
          </div>
        </div>
        {!t?.clockOut && <ClockButton action={t?.clockIn ? 'out' : 'in'} />}
      </div>
    </div>
  );
}

const STATE: Record<string, [string, string]> = {
  IN: ['In', 'ok'], LATE: ['Late', 'warn'], OUT: ['Left', 'info'], ON_LEAVE: ['On leave', 'info'], ABSENT: ['Absent', 'bad'], NOT_IN: ['Not in yet', ''],
};

/** Who's in today — for managers (their team) and HR/Owner (everyone). */
function TeamBoard({ team, title }: { team: any; title: string }) {
  const order = ['LATE', 'NOT_IN', 'ABSENT', 'IN', 'OUT', 'ON_LEAVE'];
  const list = [...team.roster].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return (
    <Panel title={title} span={2} action={<Link to="/attendance" className="btn sm">Register</Link>}>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="badge ok">In {team.counts.in}</span><span className="badge warn">Late {team.counts.late}</span><span className="badge info">Leave {team.counts.onLeave}</span>
        <span className="badge bad">Absent {team.counts.absent}</span><span className="badge">Not in {team.counts.notIn}</span>
      </div>
      {!list.length ? <div className="muted">No team members.</div> : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>{list.map((r) => {
          const [label, tone] = STATE[r.state];
          return <div className="list-row" key={r.id}>
            <div className="grow"><Who name={r.name} id={r.id} sub={r.leave || (r.shift ? `${r.shift.name} ${r.shift.start}–${r.shift.end}` : r.designation)} /></div>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{r.clockIn ? `${fmtTime(r.clockIn)}${r.clockOut ? ` – ${fmtTime(r.clockOut)}` : ''}` : ''}{r.lateMinutes ? ` · ${fmtMins(r.lateMinutes)} late` : ''}</span>
            <SelfieThumbs inId={r.photoId} name={r.name} />
            <span className={'badge ' + tone} style={{ minWidth: 70, textAlign: 'center' }}>{label}</span>
          </div>;
        })}</div>
      )}
    </Panel>
  );
}

/** Pending leave and claims with one-tap approve / reject. */
function Approvals({ team }: { team: any }) {
  const leave = useAction(([id, status]: [string, string]) => patch(`/leave/requests/${id}/decision`, { status }), { ok: 'Done', invalidate: ['/home', '/leave'] });
  const claim = useAction(([id, status]: [string, string]) => patch(`/claims/${id}/decision`, { status }), { ok: 'Done', invalidate: ['/home', '/claims'] });
  const { leave: L, claims: C } = team.approvals;
  const empty = !L.length && !C.length;
  return (
    <Panel title="Waiting for your approval" action={<span className="badge warn">{team.pending.leave + team.pending.claims + team.pending.timesheets}</span>}>
      {empty && <div className="muted">Nothing waiting. 🎉{team.pending.timesheets ? <> <Link to="/timesheets">{team.pending.timesheets} timesheet entries</Link> to review.</> : ''}</div>}
      {L.map((l: any) => <div className="list-row" key={l.id}>
        <div className="grow"><b>{l.name}</b><div className="small muted">{l.type} · {fmtShort(l.fromDate)}{l.toDate !== l.fromDate ? ` → ${fmtShort(l.toDate)}` : ''} · {l.days}d{l.reason ? ` · ${l.reason}` : ''}</div></div>
        <button className="btn sm" onClick={() => leave.run([l.id, 'REJECTED'])}>Reject</button><button className="btn sm primary" onClick={() => leave.run([l.id, 'APPROVED'])}>Approve</button>
      </div>)}
      {C.map((c: any) => <div className="list-row" key={c.id}>
        <div className="grow"><b>{c.name}</b><div className="small muted">{c.category} claim · {money(c.amount)} · {fmtShort(c.date)}</div></div>
        <button className="btn sm" onClick={() => claim.run([c.id, 'REJECTED'])}>Reject</button><button className="btn sm primary" onClick={() => claim.run([c.id, 'APPROVED'])}>Approve</button>
      </div>)}
      {team.pending.timesheets > 0 && !empty && <div className="small" style={{ marginTop: 8 }}><Link to="/timesheets">{team.pending.timesheets} timesheet entries to review →</Link></div>}
    </Panel>
  );
}

function MyWork({ h }: { h: any }) {
  return <>
    {h.myTasks && <Panel title="My tasks" action={<Link to="/tasks" className="btn sm">All</Link>}>
      {h.myTasks.length ? h.myTasks.map((t: any) => <div className="list-row" key={t.id}><Badge s={t.priority} /><span className="grow">{t.title}</span><span className="faint small">{t.dueDate ? fmtShort(t.dueDate) : ''}</span></div>)
        : <div className="muted">Nothing on your plate. 🎉</div>}
    </Panel>}
    {h.upcomingMeetings && <Panel title="Upcoming meetings" action={<Link to="/meetings" className="btn sm">Calendar</Link>}>
      {h.upcomingMeetings.length ? h.upcomingMeetings.map((m: any) => <div className="list-row" key={m.id}><div className="grow"><b>{m.title}</b><div className="small muted">{fmtDateTime(m.startAt)}{m.location ? ` · ${m.location}` : ''}</div></div></div>)
        : <div className="muted">No meetings in the next 2 weeks.</div>}
    </Panel>}
  </>;
}

function Announcements({ h }: { h: any }) {
  if (!h.announcements) return null;
  return <Panel title="Announcements" action={<Link to="/feed" className="btn sm">Feed</Link>}>
    {h.announcements.length ? h.announcements.map((p: any) => <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}><div><div style={{ whiteSpace: 'pre-wrap' }}>{p.content.slice(0, 160)}</div><div className="small faint">{p.authorName} · {fmtShort(p.createdAt)}</div></div></div>)
      : <div className="muted">No announcements.</div>}
  </Panel>;
}

/* ───────── role views ───────── */
function EmployeeView({ h }: { h: any }) {
  return <>
    <div className="grid g4">
      <ClockCard h={h} />
      {h.latestPayslip !== undefined && <Tile label={h.latestPayslip ? `Net pay · ${monthLabel(h.latestPayslip.period)}` : 'Payslips'} value={h.latestPayslip ? money(h.latestPayslip.net) : '—'} sub="View payslips" to="/me/payslips" />}
      {h.myTasks && <Tile label="Open tasks" value={h.myTasks.length} sub={h.myTasks[0] ? `Next: ${h.myTasks[0].title}` : 'All clear'} to="/tasks" />}
    </div>
    <div className="grid g3">
      <MyWork h={h} />
      {h.myLeave && <Panel title="My leave" action={<Link to="/leave" className="btn sm">Apply</Link>}>
        {h.myLeave.length ? h.myLeave.map((l: any) => <div className="list-row" key={l.id}><span className="grow">{l.type}<div className="small muted">{fmtShort(l.fromDate)} → {fmtShort(l.toDate)} · {l.days}d</div></span><Badge s={l.status} /></div>)
          : <div className="muted">No upcoming leave.</div>}
      </Panel>}
      <Announcements h={h} />
    </div>
    {!h.employee && <div className="banner info">Your account isn't linked to an employee profile yet, so clock-in, payslips and leave are off. Ask HR to link it in Team & access.</div>}
  </>;
}

function ManagerView({ h }: { h: any }) {
  const t = h.team;
  return <>
    <div className="grid g4">
      <ClockCard h={h} />
      <Tile label="My team in today" value={`${t.counts.in} / ${t.counts.total}`} sub={`${t.counts.late} late · ${t.counts.onLeave} on leave`} to="/attendance" />
      <Tile label="Overdue team tasks" value={t.overdueTasks} tone={t.overdueTasks ? 'var(--bad)' : undefined} sub="Assigned to your reports" to="/tasks" />
    </div>
    <div className="grid g3">
      <TeamBoard team={t} title="My team today" />
      <Approvals team={t} />
      <MyWork h={h} />
      <Announcements h={h} />
    </div>
  </>;
}

function HrPeople({ hr }: { hr: any }) {
  const row = (k: string, name: string, sub: string, tone = '') => <div className="list-row" key={k}><span className="grow">{name}</span><span className={'badge ' + tone}>{sub}</span></div>;
  const any = hr.birthdays.length || hr.anniversaries.length || hr.joiners.length || hr.leavers.length;
  return (
    <Panel title="People this fortnight">
      {!any && <div className="muted">No birthdays, anniversaries, joiners or leavers coming up.</div>}
      {hr.birthdays.map((b: any) => row('b' + b.id, `🎂 ${b.name}`, `Birthday ${fmtShort(b.date)}`, 'warn'))}
      {hr.anniversaries.map((a: any) => row('a' + a.id, `🏅 ${a.name}`, `${a.years} yr${a.years > 1 ? 's' : ''} · ${fmtShort(a.date)}`, 'brand'))}
      {hr.joiners.map((j: any) => row('j' + j.id, `👋 ${j.name}`, `Joins ${fmtShort(j.joinDate)}`, 'ok'))}
      {hr.leavers.map((l: any) => row('l' + l.id, `🚪 ${l.name}`, `Last day ${fmtShort(l.exitDate)}`, 'bad'))}
    </Panel>
  );
}

function HrQueues({ h }: { h: any }) {
  const hr = h.hr, p = h.payrollThisMonth;
  return (
    <Panel title="HR queues">
      {p && <Link to="/payroll" className="list-row" style={{ color: 'inherit' }}><span className="grow">Payroll · {monthLabel(p.period)}</span><Badge s={p.status || 'PENDING'}>{p.status ? titleCase(p.status) : 'Not run'}</Badge></Link>}
      {hr.onboardingInProgress > 0 && <Link to="/onboarding" className="list-row" style={{ color: 'inherit' }}><span className="grow">Onboarding in progress</span><b>{hr.onboardingInProgress}</b></Link>}
      <Link to="/services" className="list-row" style={{ color: 'inherit' }}><span className="grow">Open helpdesk requests</span><b>{hr.openServiceRequests}</b></Link>
      <Link to="/recruitment" className="list-row" style={{ color: 'inherit' }}><span className="grow">New job applicants</span><b>{hr.newApplicants}</b></Link>
      <Link to="/team" className="list-row" style={{ color: 'inherit' }}><span className="grow">Invite staff to the app</span><Icon name="plus" size={16} /></Link>
    </Panel>
  );
}

function HrView({ h }: { h: any }) {
  const t = h.team;
  return <>
    <div className="grid g4">
      <Tile label="In today" value={`${t.counts.in} / ${t.counts.total}`} sub={`${t.counts.notIn} not in yet · ${t.counts.absent} absent`} to="/attendance" />
      <Tile label="Late today" value={t.counts.late} tone={t.counts.late ? 'var(--warn)' : undefined} sub="Edit or excuse in the register" to="/attendance" />
      <Tile label="On leave today" value={t.counts.onLeave} sub={t.onLeaveToday.map((x: any) => x.name.split(' ')[0]).slice(0, 3).join(', ') || '—'} to="/leave" />
      <Tile label="Approvals waiting" value={t.pending.leave + t.pending.claims + t.pending.timesheets} tone="var(--warn)" sub={`${t.pending.leave} leave · ${t.pending.claims} claims · ${t.pending.timesheets} timesheets`} to="/leave" />
    </div>
    <div className="grid g3">
      <TeamBoard team={t} title="Attendance board" />
      <Approvals team={t} />
      <HrPeople hr={h.hr} />
      <HrQueues h={h} />
      <ClockCard h={h} compact />
    </div>
  </>;
}

function OwnerView({ h }: { h: any }) {
  const o = h.owner, t = h.team;
  const max = Math.max(1, ...o.payrollTrend.map((p: any) => p.cost));
  const usage = o.plan.maxEmployees ? `${o.activeEmployees} / ${o.plan.maxEmployees}` : `${o.activeEmployees}`;
  return <>
    <div className="grid g4">
      <Tile label="Active employees" value={usage} sub={`${o.joinersYtd} joined · ${o.leaversYtd} left this year`} to="/employees" />
      <Tile label="Monthly basic payroll" value={money(o.monthlyBasic)} sub="Before allowances and contributions" />
      <Tile label={`Payroll · ${h.payrollThisMonth ? monthLabel(h.payrollThisMonth.period) : ''}`} value={h.payrollThisMonth?.cost != null ? money(h.payrollThisMonth.cost) : 'Not run'} sub={h.payrollThisMonth?.status ? `Employer cost · ${titleCase(h.payrollThisMonth.status)}` : 'Generate in Payroll'} to="/payroll" />
      <Tile label="Plan" value={titleCase(o.plan.code)} sub={o.plan.periodEnd && o.plan.code !== 'FREE' ? `Paid until ${fmtDate(o.plan.periodEnd)}` : 'Upgrade for more apps'} to="/billing" />
    </div>
    <div className="grid g3">
      <Panel title="Payroll cost — last 6 runs" span={2} action={<Link to="/reports" className="btn sm">Reports</Link>}>
        {!o.payrollTrend.length ? <div className="muted">No payroll runs yet.</div> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 190, padding: '10px 4px 0' }}>
            {o.payrollTrend.map((p: any) => (
              <div key={p.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <span className="small num" style={{ fontWeight: 700 }}>{money(p.cost).replace(/\.\d+$/, '')}</span>
                <div title={`Net ${money(p.net)} · ${p.staff} staff`} style={{ width: '100%', maxWidth: 56, height: `${(p.cost / max) * 130}px`, background: 'var(--brand)', borderRadius: '8px 8px 3px 3px', minHeight: 4 }} />
                <span className="small muted">{new Date(p.period + '-01').toLocaleDateString('en-GB', { month: 'short' })}</span>
              </div>))}
          </div>
        )}
      </Panel>
      <Approvals team={t} />
      <TeamBoard team={t} title="Today across the company" />
      <HrPeople hr={h.hr} />
    </div>
  </>;
}
