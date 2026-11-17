import { View } from 'react-native';
import { addDays, today } from '../src/format';
import { useGet } from '../src/hooks';
import { C } from '../src/theme';
import { Empty, Loading, Row, Screen, T } from '../src/ui';

export default function Shifts() {
  const q = useGet<any>(`/shifts/roster?mine=1&from=${today()}&days=14`);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {!q.data ? <Loading /> : !q.data.assignments.length ? <Empty title="No shifts scheduled" sub="Your roster for the next 2 weeks shows here." icon="view-grid-outline" /> : days.map((d) => {
        const a = q.data.assignments.find((x: any) => x.date === d);
        const dt = new Date(d + 'T00:00:00');
        return (
          <Row key={d} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, opacity: a ? 1 : 0.55 }}>
            <View style={{ width: 52, alignItems: 'center' }}><T muted small>{dt.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</T><T bold style={{ fontSize: 22 }}>{dt.getDate()}</T></View>
            {a ? <View style={{ flex: 1, backgroundColor: a.color, borderRadius: 10, padding: 10 }}><T bold style={{ color: '#fff' }}>{a.name}</T><T small style={{ color: '#fff' }}>{a.startTime} – {a.endTime}{a.note ? ` · ${a.note}` : ''}</T></View>
              : <T muted style={{ flex: 1 }}>Off</T>}
            {d === today() && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand }} />}
          </Row>);
      })}
    </Screen>
  );
}
