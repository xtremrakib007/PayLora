import { useState } from 'react';
import { View } from 'react-native';
import { ClockCard } from '../../src/ClockCard';
import { addMonths, fmtMins, fmtTime, monthLabel, thisMonth } from '../../src/format';
import { useGet } from '../../src/hooks';
import { C } from '../../src/theme';
import { AuthImage, Badge, Btn, Empty, ListItem, Loading, Row, Screen, Section, T } from '../../src/ui';

export default function Attendance() {
  const [period, setPeriod] = useState(thisMonth());
  const q = useGet<any>(`/me/attendance?period=${period}`);
  const home = useGet<any>('/home');
  const s = q.data?.summary;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); home.refetch(); }}>
      {q.data && period === thisMonth() && <ClockCard today={q.data.today} shift={home.data?.shiftToday} />}
      <Row style={{ justifyContent: 'space-between' }}>
        <Btn kind="ghost" small icon="chevron-left" title="" onPress={() => setPeriod(addMonths(period, -1))} />
        <T bold>{monthLabel(period)}</T>
        <Btn kind="ghost" small icon="chevron-right" title="" onPress={() => setPeriod(addMonths(period, 1))} disabled={period >= thisMonth()} />
      </Row>
      {s && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[['Present', s.present, C.ok], ['Absent', s.absent, C.bad], ['Half day', s.half, C.warn], ['Leave', s.leave, C.info], [s.lateMinutes ? `Late · ${fmtMins(s.lateMinutes)}` : 'Late', s.late, C.warn], [s.earlyMinutes ? `Left early · ${fmtMins(s.earlyMinutes)}` : 'Left early', s.early, C.warn], ['OT hours', s.otHours, C.brand]].map(([l, n, c]) => (
            <View key={l as string} style={{ width: '31.5%', backgroundColor: '#fff', borderRadius: 14, padding: 12 }}><T bold style={{ fontSize: 22, color: c }}>{String(n)}</T><T muted small>{l as string}</T></View>))}
        </View>
      )}
      <Section title="Daily records">
        {!q.data ? <Loading /> : !q.data.records.length ? <Empty title="No records this month" icon="fingerprint" /> : [...q.data.records].reverse().map((r: any) => (
          <ListItem key={r.id} left={r.clockInPhotoId ? <AuthImage path={`/attendance/photos/${r.clockInPhotoId}`} size={40} /> : undefined} title={new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            sub={r.clockIn ? `${fmtTime(r.clockIn)} – ${fmtTime(r.clockOut)}${r.clockIn && r.clockOut ? ` · ${((new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000).toFixed(1)} h` : ''}${r.clockInLoc?.distance != null ? ` · ${r.clockInLoc.distance} m` : ''}` : 'Marked by HR'}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Badge s={r.status} />{(r.late || r.lateMinutes > 0) && <Badge s="PENDING" label={`${r.lateMinutes ? fmtMins(r.lateMinutes) + ' late' : 'Late'}${r.lateWaived ? ' · excused' : ''}`} />}{r.earlyMinutes > 0 && <Badge s="PENDING" label={`Left ${fmtMins(r.earlyMinutes)} early${r.earlyWaived ? ' · excused' : ''}`} />}</View>} />))}
      </Section>
    </Screen>
  );
}
