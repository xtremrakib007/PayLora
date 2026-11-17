import { View } from 'react-native';
import { patch } from '../src/api';
import { fmtShort, money } from '../src/format';
import { useAction, useGet } from '../src/hooks';
import { useAuth } from '../src/auth';
import { Btn, Empty, Loading, Row, Screen, Section, T } from '../src/ui';

export default function Approvals() {
  const { me, has } = useAuth();
  const leave = useGet<any[]>(has('leave') ? '/leave/requests?status=PENDING' : null);
  const claims = useGet<any[]>(has('claims') ? '/claims?status=PENDING' : null);
  const decideLeave = useAction(([id, s]: [string, string]) => patch(`/leave/requests/${id}/decision`, { status: s }), { invalidate: ['/leave', '/home'] });
  const decideClaim = useAction(([id, s]: [string, string]) => patch(`/claims/${id}/decision`, { status: s }), { invalidate: ['/claims', '/home'] });
  const others = <T extends { employeeId: string }>(l?: T[]) => (l || []).filter((x) => x.employeeId !== me?.employee?.id);
  return (
    <Screen refreshing={leave.isRefetching} onRefresh={() => { leave.refetch(); claims.refetch(); }}>
      {has('leave') && <Section title="Leave requests">
        {!leave.data ? <Loading /> : !others(leave.data).length ? <Empty title="Nothing to approve" icon="calendar-month" /> : others(leave.data).map((l) => (
          <View key={l.id} style={{ paddingVertical: 10, gap: 6 }}>
            <T bold>{l.employeeName}</T><T muted small>{l.leaveType} · {fmtShort(l.fromDate)}{l.toDate !== l.fromDate ? ` → ${fmtShort(l.toDate)}` : ''} · {l.days} d{l.reason ? `\n${l.reason}` : ''}</T>
            <Row><Btn small title="Approve" icon="check" onPress={() => decideLeave.run([l.id, 'APPROVED'])} /><Btn small kind="ghost" title="Reject" onPress={() => decideLeave.run([l.id, 'REJECTED'])} /></Row>
          </View>))}
      </Section>}
      {has('claims') && <Section title="Claims">
        {!claims.data ? <Loading /> : !others(claims.data).length ? <Empty title="Nothing to approve" icon="receipt-text-outline" /> : others(claims.data).map((c) => (
          <View key={c.id} style={{ paddingVertical: 10, gap: 6 }}>
            <T bold>{c.employeeName} · {money(c.amount)}</T><T muted small>{c.category} · {fmtShort(c.date)}{c.description ? ` · ${c.description}` : ''}</T>
            <Row><Btn small title="Approve" icon="check" onPress={() => decideClaim.run([c.id, 'APPROVED'])} /><Btn small kind="ghost" title="Reject" onPress={() => decideClaim.run([c.id, 'REJECTED'])} /></Row>
          </View>))}
      </Section>}
    </Screen>
  );
}
