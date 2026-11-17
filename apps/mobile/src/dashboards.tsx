import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { patch } from './api';
import { fmtMins, fmtShort, fmtTime, monthLabel, money, titleCase } from './format';
import { useAction } from './hooks';
import { C } from './theme';
import { AuthImage, Avatar, Badge, Btn, Icon, ListItem, Row, Section, T } from './ui';

/** Small stat tile (2 per row). */
export function Stat({ label, value, sub, color, to }: { label: string; value: string | number; sub?: string; color?: string; to?: string }) {
  return (
    <Pressable disabled={!to} onPress={() => to && router.push(to as any)} style={{ width: '48.5%', backgroundColor: '#fff', borderRadius: 16, padding: 14 }}>
      <T muted small>{label}</T>
      <Text style={{ fontSize: 22, fontWeight: '800', color: color ?? C.ink }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {!!sub && <T muted small numberOfLines={1}>{sub}</T>}
    </Pressable>
  );
}
export const Stats = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>{children}</View>;

const STATE: Record<string, [string, string]> = {
  IN: ['In', 'DONE'], LATE: ['Late', 'PENDING'], OUT: ['Left', 'IN_PROGRESS'], ON_LEAVE: ['On leave', 'LEAVE'], ABSENT: ['Absent', 'REJECTED'], NOT_IN: ['Not in', ''],
};

/** Who's in today (manager: own team, HR/owner: everyone). Shows late/not-in first. */
export function TeamToday({ team, title, limit = 8 }: { team: any; title: string; limit?: number }) {
  const order = ['LATE', 'NOT_IN', 'ABSENT', 'IN', 'OUT', 'ON_LEAVE'];
  const list = [...team.roster].sort((a: any, b: any) => order.indexOf(a.state) - order.indexOf(b.state));
  return (
    <Section title={title} action={<T small style={{ color: C.brand, fontWeight: '700' }}>{team.counts.in}/{team.counts.total} in</T>}>
      <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <Badge s="DONE" label={`In ${team.counts.in}`} /><Badge s="PENDING" label={`Late ${team.counts.late}`} /><Badge s="LEAVE" label={`Leave ${team.counts.onLeave}`} />
        <Badge s="REJECTED" label={`Absent ${team.counts.absent}`} /><Badge label={`Not in ${team.counts.notIn}`} />
      </Row>
      {list.slice(0, limit).map((r: any) => {
        const [label, tone] = STATE[r.state];
        return <ListItem key={r.id} left={r.photoId ? <AuthImage path={`/attendance/photos/${r.photoId}`} size={38} radius={19} /> : <Avatar name={r.name} />}
          title={r.name} sub={[r.clockIn && `In ${fmtTime(r.clockIn)}`, r.lateMinutes ? `${fmtMins(r.lateMinutes)} late` : null, r.leave, !r.clockIn && r.shift ? `${r.shift.name} ${r.shift.start}` : null].filter(Boolean).join(' · ') || r.designation}
          right={<Badge s={tone} label={label} />} />;
      })}
      {list.length > limit && <T muted small style={{ marginTop: 6 }}>+{list.length - limit} more — see Attendance on the web</T>}
    </Section>
  );
}

/** Pending leave and claims with approve / reject. */
export function ApprovalsCard({ team }: { team: any }) {
  const leave = useAction(([id, status]: [string, string]) => patch(`/leave/requests/${id}/decision`, { status }), { invalidate: ['/home', '/leave'] });
  const claim = useAction(([id, status]: [string, string]) => patch(`/claims/${id}/decision`, { status }), { invalidate: ['/home', '/claims'] });
  const { leave: L, claims: Cl } = team.approvals;
  const total = team.pending.leave + team.pending.claims + team.pending.timesheets;
  return (
    <Section title="Waiting for approval" action={total ? <Badge s="PENDING" label={String(total)} /> : undefined}>
      {!L.length && !Cl.length && <T muted>Nothing waiting. 🎉</T>}
      {L.map((l: any) => (
        <View key={l.id} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.line, gap: 6 }}>
          <T bold>{l.name}</T><T muted small>{l.type} · {fmtShort(l.fromDate)}{l.toDate !== l.fromDate ? ` → ${fmtShort(l.toDate)}` : ''} · {l.days}d{l.reason ? ` · ${l.reason}` : ''}</T>
          <Row><Btn small icon="check" title="Approve" onPress={() => leave.run([l.id, 'APPROVED'])} /><Btn small kind="ghost" title="Reject" onPress={() => leave.run([l.id, 'REJECTED'])} /></Row>
        </View>))}
      {Cl.map((c: any) => (
        <View key={c.id} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.line, gap: 6 }}>
          <T bold>{c.name} · {money(c.amount)}</T><T muted small>{c.category} claim · {fmtShort(c.date)}</T>
          <Row><Btn small icon="check" title="Approve" onPress={() => claim.run([c.id, 'APPROVED'])} /><Btn small kind="ghost" title="Reject" onPress={() => claim.run([c.id, 'REJECTED'])} /></Row>
        </View>))}
      {team.pending.timesheets > 0 && <T muted small style={{ marginTop: 6 }}>{team.pending.timesheets} timesheet entries to review on the web.</T>}
    </Section>
  );
}

/** Birthdays, anniversaries, joiners and leavers in the next two weeks (HR / owner). */
export function PeopleEvents({ hr }: { hr: any }) {
  const rows = [
    ...hr.birthdays.map((b: any) => ({ k: 'b' + b.id, icon: 'cake-variant' as const, name: b.name, sub: `Birthday · ${fmtShort(b.date)}`, color: C.warn })),
    ...hr.anniversaries.map((a: any) => ({ k: 'a' + a.id, icon: 'trophy-outline' as const, name: a.name, sub: `${a.years} year${a.years > 1 ? 's' : ''} · ${fmtShort(a.date)}`, color: C.brand })),
    ...hr.joiners.map((j: any) => ({ k: 'j' + j.id, icon: 'hand-wave' as const, name: j.name, sub: `Joins ${fmtShort(j.joinDate)}`, color: C.ok })),
    ...hr.leavers.map((l: any) => ({ k: 'l' + l.id, icon: 'door-open' as const, name: l.name, sub: `Last day ${fmtShort(l.exitDate)}`, color: C.bad })),
  ];
  if (!rows.length) return null;
  return <Section title="People this fortnight">{rows.map((r) => <ListItem key={r.k} left={<Icon name={r.icon} size={22} color={r.color} />} title={r.name} sub={r.sub} />)}</Section>;
}

/** Owner / HR headline numbers. */
export function AdminStats({ h }: { h: any }) {
  const t = h.team, o = h.owner, p = h.payrollThisMonth;
  if (o) return (
    <Stats>
      <Stat label="Active employees" value={o.plan.maxEmployees ? `${o.activeEmployees}/${o.plan.maxEmployees}` : o.activeEmployees} sub={`${o.joinersYtd} joined this year`} to="/directory" />
      <Stat label="Monthly basic" value={money(o.monthlyBasic).replace(/\.\d+$/, '')} sub="Before allowances" />
      <Stat label={p ? monthLabel(p.period) : 'Payroll'} value={p?.cost != null ? money(p.cost).replace(/\.\d+$/, '') : 'Not run'} sub={p?.status ? titleCase(p.status) : 'Run on the web'} />
      <Stat label="In today" value={`${t.counts.in}/${t.counts.total}`} sub={`${t.counts.late} late · ${t.counts.onLeave} on leave`} />
    </Stats>
  );
  return (
    <Stats>
      <Stat label="In today" value={`${t.counts.in}/${t.counts.total}`} sub={`${t.counts.notIn} not in yet`} />
      <Stat label="Late today" value={t.counts.late} color={t.counts.late ? C.warn : undefined} sub="Excuse on the web" />
      <Stat label="On leave" value={t.counts.onLeave} sub={`${t.counts.absent} absent`} />
      <Stat label="Approvals" value={t.pending.leave + t.pending.claims + t.pending.timesheets} color={C.warn} sub={`${h.hr?.openServiceRequests ?? 0} helpdesk open`} to="/approvals" />
    </Stats>
  );
}
