import { Link } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtShort, fmtTime, monthLabel, money, titleCase } from '../lib/format';
import { useAction, useGet } from '../lib/hooks';
import { APPS } from '../lib/modules';
import { Icon } from '../components/Icon';
import { Badge, Spinner } from '../components/ui';

export function Home() {
  const { me, has } = useAuth();
  const q = useGet<any>('/home');
  const clock = useAction((action: 'in' | 'out') => clockWithLocation(action), { ok: (r: any) => (r.clockOut ? 'Clocked out' : 'Clocked in'), invalidate: ['/home', '/me/attendance'] });
  const apps = APPS.filter((a) => !a.roles || (me?.role && a.roles.includes(me.role)));
  const h = q.data;
  const hour = new Date().getHours();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <div>
          <h2 style={{ fontSize: 24 }}>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {me?.user.name.split(' ')[0]}</h2>
          <div className="muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {me?.company?.name}</div>
        </div>
      </div>

      {!q.data ? <Spinner /> : <>
        {(h.attendanceToday !== undefined || h.team) && (
          <div className="grid g4">
            {h.attendanceToday !== undefined && h.employee && (
              <div className="tile" style={{ gridColumn: 'span 2', background: 'linear-gradient(135deg,#10251f,#0d6b5c)', color: '#fff' }}>
                <div className="row between">
                  <div>
                    <div className="l" style={{ color: '#a9d3c7' }}>Today's attendance</div>
                    <div className="v">{h.attendanceToday?.clockIn ? (h.attendanceToday.clockOut ? 'Done for today' : 'Clocked in') : 'Not clocked in'}</div>
                    <div className="s" style={{ color: '#cfe7e0' }}>
                      {h.attendanceToday?.clockIn ? `In ${fmtTime(h.attendanceToday.clockIn)}${h.attendanceToday.clockOut ? ` · Out ${fmtTime(h.attendanceToday.clockOut)}` : ''}${h.attendanceToday.late ? ' · late' : ''}` : h.shiftToday ? `Shift: ${h.shiftToday.name} ${h.shiftToday.start}–${h.shiftToday.end}` : 'Clock in from here or the mobile app'}
                    </div>
                  </div>
                  {!h.attendanceToday?.clockOut && (
                    <button className="btn" disabled={clock.busy} onClick={() => clock.run(h.attendanceToday?.clockIn ? 'out' : 'in')}>
                      {h.attendanceToday?.clockIn ? 'Clock out' : 'Clock in'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {h.team && <>
              <Link to="/leave" className="tile" style={{ color: 'inherit' }}><div className="l">Pending approvals</div><div className="v num">{h.team.pending.leave + h.team.pending.claims + h.team.pending.timesheets}</div><div className="s">{h.team.pending.leave} leave · {h.team.pending.claims} claims · {h.team.pending.timesheets} timesheets</div></Link>
              <Link to="/attendance" className="tile" style={{ color: 'inherit' }}><div className="l">Present today</div><div className="v num">{(h.team.attendanceToday.PRESENT || 0) + (h.team.attendanceToday.HALF_DAY || 0)} / {h.team.headcount}</div><div className="s">{h.team.onLeaveToday.length} on leave · {h.team.attendanceToday.ABSENT || 0} absent</div></Link>
            </>}
            {h.payrollThisMonth && (
              <Link to="/payroll" className="tile" style={{ color: 'inherit' }}><div className="l">Payroll · {monthLabel(h.payrollThisMonth.period)}</div>
                <div className="v num">{h.payrollThisMonth.net != null ? money(h.payrollThisMonth.net) : 'Not run'}</div><div className="s">{h.payrollThisMonth.status ? titleCase(h.payrollThisMonth.status) : 'Generate from Payroll'}</div></Link>
            )}
          </div>
        )}

        <div className="card">
          <div className="apps">
            {apps.map((a) => {
              const on = has(a.module);
              return (
                <Link key={a.key} to={on ? a.path : '/billing'} className={'app' + (on ? '' : ' locked')} title={on ? a.blurb : 'Not on your plan'}>
                  <div className="ic" style={{ background: a.bg }}><Icon name={a.icon} size={34} color={a.fg} /></div>{a.title}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid g3">
          {h.myTasks && (
            <div className="card" style={{ margin: 0 }}><div className="hd"><h3>My tasks</h3><Link to="/tasks" className="btn sm">All</Link></div>
              {h.myTasks.length ? h.myTasks.map((t: any) => <div className="list-row" key={t.id}><Badge s={t.priority} /><span className="grow">{t.title}</span><span className="faint small">{t.dueDate ? fmtShort(t.dueDate) : ''}</span></div>)
                : <div className="muted">Nothing on your plate. 🎉</div>}
            </div>
          )}
          {h.upcomingMeetings && (
            <div className="card" style={{ margin: 0 }}><div className="hd"><h3>Upcoming meetings</h3><Link to="/meetings" className="btn sm">Calendar</Link></div>
              {h.upcomingMeetings.length ? h.upcomingMeetings.map((m: any) => <div className="list-row" key={m.id}><div className="grow"><b>{m.title}</b><div className="small muted">{fmtDateTime(m.startAt)}{m.location ? ` · ${m.location}` : ''}</div></div></div>)
                : <div className="muted">No meetings in the next 2 weeks.</div>}
            </div>
          )}
          {h.announcements && (
            <div className="card" style={{ margin: 0 }}><div className="hd"><h3>Announcements</h3><Link to="/feed" className="btn sm">Feed</Link></div>
              {h.announcements.length ? h.announcements.map((p: any) => <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}><div><div style={{ whiteSpace: 'pre-wrap' }}>{p.content.slice(0, 160)}</div><div className="small faint">{p.authorName} · {fmtShort(p.createdAt)}</div></div></div>)
                : <div className="muted">No announcements.</div>}
            </div>
          )}
          {h.latestPayslip !== undefined && (
            <div className="card" style={{ margin: 0 }}><div className="hd"><h3>Latest payslip</h3><Link to="/me/payslips" className="btn sm">All</Link></div>
              {h.latestPayslip ? <><div className="muted">{monthLabel(h.latestPayslip.period)}</div><div style={{ fontSize: 26, fontWeight: 800 }} className="num">{money(h.latestPayslip.net)}</div><div className="small faint">Net pay</div></> : <div className="muted">No payslips yet.</div>}
            </div>
          )}
          {h.myLeave && (
            <div className="card" style={{ margin: 0 }}><div className="hd"><h3>My leave</h3><Link to="/leave" className="btn sm">Apply</Link></div>
              {h.myLeave.length ? h.myLeave.map((l: any) => <div className="list-row" key={l.id}><span className="grow">{l.type}<div className="small muted">{fmtShort(l.fromDate)} → {fmtShort(l.toDate)} · {l.days}d</div></span><Badge s={l.status} /></div>)
                : <div className="muted">No upcoming leave.</div>}
            </div>
          )}
          {h.team?.onLeaveToday?.length > 0 && (
            <div className="card" style={{ margin: 0 }}><h3>On leave today</h3>{h.team.onLeaveToday.map((p: any, i: number) => <div className="list-row" key={i}><span className="grow">{p.name}</span><span className="badge info">{p.type}</span></div>)}</div>
          )}
        </div>
        {!me?.employee && me?.role !== 'OWNER' && <div className="banner info">Your account isn't linked to an employee profile yet, so self-service (clock-in, payslips, leave) is off. Ask HR to link it in Team & access.</div>}
      </>}
    </div>
  );
}

/** Clock in/out, attaching GPS when the browser allows it. */
export async function clockWithLocation(action: 'in' | 'out') {
  const pos = await new Promise<GeolocationPosition | null>((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
  return post('/me/attendance/clock', { action, ...(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } : {}) });
}
